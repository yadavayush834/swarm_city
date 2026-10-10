"""Live AI bridge: streams the REAL Python sim (ai/* algorithms) to the 3D
frontend over WebSockets. Standard library only — no pip install needed.

Run from repo root:
    python3 bridge/server.py [--port 8130] [--n 20] [--seed 7]

Protocol (JSON text frames):
  server -> client:
    {"type":"map","n":..,"grid":[[..]],"drones":[..],"victims":[..],
     "fires":[[x,y]..],"stats":{..},"running":bool}
    {"type":"state","seq":..,"drones":[..],"victims":[..],"fires":[..],
     "stats":{..},"running":bool,"events":[[seq,msg],..]}
  client -> server:
    {"cmd":"run"|"pause"|"newcity"|"set-algo"|"set-speed","algo":..,"speed":..}
"""
import argparse
import base64
import hashlib
import json
import random
import socket
import struct
import sys
import threading
import time

sys.path.insert(0, '.')
from sim.city import (generate_city, cells_of, ROAD, FIRE, VICTIM, SHELTER)
from ai.search import astar, bfs, ucs, greedy
from ai import csp_logic
from ai.probabilistic import Kalman1D

SEARCH = {'astar': astar, 'bfs': bfs, 'ucs': ucs, 'greedy': greedy}
COLORS = ['#38bdf8', '#f472b6', '#a3e635']
WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


class Sim:
    def __init__(self, n=20, seed=None):
        self.n = n
        self.seed = seed if seed is not None else random.randrange(10 ** 9)
        self.algo = 'astar'
        self.speed = 10
        self.running = False
        self.lock = threading.Lock()
        self.events = []
        self.seq = 0
        self.new_city()

    def log(self, msg):
        self.seq += 1
        self.events.append([self.seq, msg])
        del self.events[:-40]

    def new_city(self):
        random.seed(self.seed)
        n = self.n
        self.grid = generate_city(n=n, n_victims=8, n_fires=10, n_rubble=14,
                                  districts=True, seed=self.seed)
        self.shelters = cells_of(self.grid, SHELTER)
        self.victims = [{'id': k, 'x': x, 'y': y, 'st': 'wait'}
                        for k, (x, y) in enumerate(cells_of(self.grid, VICTIM))]
        self.fires = cells_of(self.grid, FIRE)
        self.drones = []
        for i, (sx, sy) in enumerate(self.shelters[:3]):
            self.drones.append({
                'id': i, 'gx': sx, 'gy': sy, 'fx': float(sx), 'fy': float(sy),
                'path': [], 'target': None, 'carry': None, 'wait': 0.0,
                'color': COLORS[i % 3],
                'kfx': Kalman1D(x=float(sx)), 'kfy': Kalman1D(x=float(sy)),
                'wind': random.uniform(0, 10), 'smoke': random.uniform(0, 10),
            })
        self.steps = 0
        self.cost = 0
        self.rescued = 0
        self.log(f'new city: {len(self.victims)} victims, {len(self.shelters)} shelters (seed {self.seed})')

    def tile_cost(self, x, y):
        return 5 if self.grid[x][y] == FIRE else 1

    def assign(self):
        fn = SEARCH.get(self.algo, astar)
        for d in self.drones:
            if d['path'] or d['carry'] is not None or d['wait'] > 0:
                continue
            best, bd, bp = None, 1e9, []
            for v in self.victims:
                if v['st'] != 'wait':
                    continue
                if any(o is not d and o['target'] == v['id'] for o in self.drones):
                    continue
                res = fn(self.grid, (d['gx'], d['gy']), (v['x'], v['y']))
                path, c = (res if isinstance(res, tuple) else (res, len(res)))
                if path and c < bd:
                    best, bd, bp = v, c, path
            if best:
                d['target'] = best['id']
                d['path'] = [list(p) for p in bp[1:]]
                self.log(f"drone {d['id']} -> victim {best['id']} ({self.algo}, cost {bd})")

    def tick(self, dt):
        with self.lock:
            if not self.running:
                return
            # slowly drifting weather per drone feeds the fuzzy controller
            for d in self.drones:
                d['wind'] = max(0, min(10, d['wind'] + random.gauss(0, 0.4)))
                d['smoke'] = max(0, min(10, d['smoke'] + random.gauss(0, 0.4)))
            self.assign()
            for d in self.drones:
                if d['wait'] > 0:
                    d['wait'] -= dt
                    continue
                if not d['path']:
                    v = next((v for v in self.victims
                              if v['id'] == d['target'] and v['st'] == 'wait'), None)
                    if v and (d['gx'], d['gy']) == (v['x'], v['y']) and d['carry'] is None:
                        v['st'] = 'carried'
                        d['carry'] = v['id']
                        d['target'] = None
                        d['wait'] = 0.8
                        s = min(self.shelters,
                                key=lambda s: abs(d['gx'] - s[0]) + abs(d['gy'] - s[1]))
                        res = SEARCH.get(self.algo, astar)(self.grid, (d['gx'], d['gy']), s)
                        path = res[0] if isinstance(res, tuple) else res
                        d['path'] = [list(p) for p in path[1:]]
                        self.log(f"picked victim {v['id']}, heading to shelter")
                    elif d['carry'] is not None and (d['gx'], d['gy']) in self.shelters:
                        vv = next((v for v in self.victims if v['id'] == d['carry']), None)
                        if vv:
                            self.victims.remove(vv)
                        self.log(f"RESCUED victim {d['carry']}")
                        d['carry'] = None
                        self.rescued += 1
                        if not self.victims:
                            self.log('ALL VICTIMS RESCUED')
                            self.running = False
                    continue
                # fuzzy-logic speed for this drone's conditions
                v_ms = csp_logic.fuzzy_speed(d['wind'], d['smoke'])
                step = (v_ms / 5.0) * (0.6 + self.speed * 0.22) * dt * 2.0
                nx, ny = d['path'][0]
                dx, dy = nx - d['fx'], ny - d['fy']
                dist = (dx * dx + dy * dy) ** 0.5
                if dist <= step:
                    d['fx'], d['fy'] = float(nx), float(ny)
                    d['gx'], d['gy'] = nx, ny
                    d['path'].pop(0)
                    self.cost += self.tile_cost(nx, ny)
                    self.steps += 1
                    if self.grid[nx][ny] == FIRE and d['carry'] is None and random.random() < 0.35:
                        self.grid[nx][ny] = ROAD
                        self.fires = [f for f in self.fires if f != [nx, ny] and f != (nx, ny)]
                        self.log('fire extinguished by water drop')
                else:
                    d['fx'] += dx / dist * step
                    d['fy'] += dy / dist * step
                # noisy GPS -> Kalman filter; clients see the FILTERED position
                d['kfx'].update(d['fx'] + random.gauss(0, 0.3))
                d['kfy'].update(d['fy'] + random.gauss(0, 0.3))

    def snapshot(self, full=False):
        with self.lock:
            drones = [{'id': d['id'], 'gx': d['gx'], 'gy': d['gy'],
                       'fx': round(d['kfx'].x, 3), 'fy': round(d['kfy'].x, 3),
                       'path': d['path'], 'target': d['target'],
                       'carry': d['carry'], 'color': d['color']}
                      for d in self.drones]
            snap = {'drones': drones,
                    'victims': [dict(v) for v in self.victims],
                    'fires': [list(f) for f in self.fires],
                    'stats': {'rescued': self.rescued, 'steps': self.steps,
                              'cost': self.cost,
                              'left': sum(1 for v in self.victims if v['st'] == 'wait')},
                    'running': self.running, 'events': list(self.events[-8:])}
            if full:
                snap['type'] = 'map'
                snap['n'] = self.n
                snap['grid'] = self.grid
            else:
                snap['type'] = 'state'
            return snap

    def handle_cmd(self, msg):
        cmd = msg.get('cmd')
        with self.lock:
            if cmd == 'run':
                self.running = True
                self.log('rescue started (live backend)')
            elif cmd == 'pause':
                self.running = False
                self.log('paused')
            elif cmd == 'newcity':
                self.seed = msg.get('seed', random.randrange(10 ** 9))
                self.new_city()
            elif cmd == 'set-algo' and msg.get('algo') in SEARCH:
                self.algo = msg['algo']
                self.log(f'algorithm -> {self.algo}')
            elif cmd == 'set-speed':
                self.speed = max(1, min(20, int(msg.get('speed', 10))))


# ---------- minimal WebSocket server (stdlib) ----------

def ws_accept(key):
    h = hashlib.sha1((key + WS_MAGIC).encode()).digest()
    return base64.b64encode(h).decode()


def send_frame(conn, data: bytes, opcode=0x1):
    header = bytes([0x80 | opcode])
    n = len(data)
    if n < 126:
        header += bytes([n])
    elif n < 65536:
        header += bytes([126]) + struct.pack('!H', n)
    else:
        header += bytes([127]) + struct.pack('!Q', n)
    conn.sendall(header + data)


def send_text(conn, obj):
    send_frame(conn, json.dumps(obj).encode())


def recv_frame(conn):
    hdr = conn.recv(2)
    if len(hdr) < 2:
        raise ConnectionError('closed')
    fin_op, mask_len = hdr[0], hdr[1]
    opcode = fin_op & 0x0F
    masked = bool(mask_len & 0x80)
    n = mask_len & 0x7F
    if n == 126:
        n = struct.unpack('!H', conn.recv(2))[0]
    elif n == 127:
        n = struct.unpack('!Q', conn.recv(8))[0]
    mask = conn.recv(4) if masked else b''
    data = b''
    while len(data) < n:
        chunk = conn.recv(n - len(data))
        if not chunk:
            raise ConnectionError('closed')
        data += chunk
    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    return opcode, data


class Bridge:
    def __init__(self, sim, port):
        self.sim = sim
        self.port = port
        self.clients = set()
        self.clients_lock = threading.Lock()

    def broadcast(self, obj):
        raw = json.dumps(obj).encode()
        dead = []
        with self.clients_lock:
            for c in list(self.clients):
                try:
                    send_frame(c, raw)
                except OSError:
                    dead.append(c)
            for c in dead:
                self.clients.discard(c)

    def handle(self, conn):
        try:
            req = b''
            while b'\r\n\r\n' not in req:
                chunk = conn.recv(4096)
                if not chunk:
                    conn.close()
                    return
                req += chunk
            head = req.decode('latin1')
            if 'Upgrade: websocket' not in head and 'upgrade: websocket' not in head.lower():
                body = b'swarm_city live bridge: connect with a WebSocket client'
                conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: %d\r\nContent-Type: text/plain\r\n\r\n%b'
                             % (len(body), body))
                conn.close()
                return
            key = next(l.split(':', 1)[1].strip() for l in head.split('\r\n')
                       if l.lower().startswith('sec-websocket-key'))
            conn.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
                          'Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n'
                          % ws_accept(key)).encode())
            with self.clients_lock:
                self.clients.add(conn)
            send_text(conn, self.sim.snapshot(full=True))
            while True:
                opcode, data = recv_frame(conn)
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    send_frame(conn, data, opcode=0xA)
                    continue
                if opcode == 0x1:
                    try:
                        msg = json.loads(data.decode())
                    except ValueError:
                        continue
                    first = isinstance(msg, dict) and msg.get('cmd') == 'newcity'
                    self.sim.handle_cmd(msg)
                    if first or (isinstance(msg, dict) and msg.get('cmd') in ('newcity',)):
                        send_text(conn, self.sim.snapshot(full=True))
        except (OSError, ConnectionError):
            pass
        finally:
            with self.clients_lock:
                self.clients.discard(conn)
            try:
                conn.close()
            except OSError:
                pass

    def serve(self, hz=10):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(('0.0.0.0', self.port))
        srv.listen(16)
        print(f'live bridge on ws://localhost:{self.port} (n={self.sim.n})', flush=True)

        def simloop():
            dt = 1.0 / hz
            while True:
                t0 = time.time()
                self.sim.tick(dt)
                self.broadcast(self.sim.snapshot())
                time.sleep(max(0, dt - (time.time() - t0)))

        threading.Thread(target=simloop, daemon=True).start()
        while True:
            conn, _ = srv.accept()
            threading.Thread(target=self.handle, args=(conn,), daemon=True).start()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8130)
    ap.add_argument('--n', type=int, default=20)
    ap.add_argument('--seed', type=int, default=None)
    args = ap.parse_args()
    sim = Sim(n=args.n, seed=args.seed)
    Bridge(sim, args.port).serve()


if __name__ == '__main__':
    main()
