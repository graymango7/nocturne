// PeerJS(WebRTC) P2P 연결 — 서버 없이 링크만으로 멀티플레이
const PREFIX = 'nocturne-crash-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  constructor() {
    this.peer = null; this.conns = new Map(); this.hostConn = null;
    this.isHost = false; this.id = 'solo';
    this.onData = () => {};   // (fromId, msg)
    this.onLeave = () => {};  // 호스트: 클라이언트가 나감
    this.onClose = () => {};  // 클라이언트: 호스트 연결 끊김
  }

  host(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('PeerJS를 불러오지 못했습니다'));
      const peer = new Peer(PREFIX + code, { debug: 1 });
      this.peer = peer; this.isHost = true;
      peer.on('open', id => { this.id = id; resolve(id); });
      peer.on('error', e => reject(e));
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
      peer.on('connection', c => {
        c.on('open', () => this.conns.set(c.peer, c));
        c.on('data', d => this.onData(c.peer, d));
        c.on('close', () => { this.conns.delete(c.peer); this.onLeave(c.peer); });
        c.on('error', () => {});
      });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('PeerJS를 불러오지 못했습니다'));
      const peer = new Peer({ debug: 1 });
      this.peer = peer;
      const timer = setTimeout(() => reject(new Error('시간 초과 — 방을 찾을 수 없습니다')), 15000);
      peer.on('error', e => { clearTimeout(timer); reject(e); });
      peer.on('open', id => {
        this.id = id;
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => { clearTimeout(timer); this.hostConn = c; resolve(id); });
        c.on('data', d => this.onData('host', d));
        c.on('close', () => this.onClose());
        c.on('error', () => {});
      });
    });
  }

  sendHost(m) { if (this.hostConn?.open) this.hostConn.send(m); }
  sendTo(pid, m) { const c = this.conns.get(pid); if (c?.open) c.send(m); }
  broadcast(m) { if (!this.conns.size) return; for (const c of this.conns.values()) if (c.open) c.send(m); }
  kick(pid) { const c = this.conns.get(pid); if (c) setTimeout(() => c.close(), 300); }
  destroy() { try { this.peer?.destroy(); } catch {} this.peer = null; this.conns.clear(); this.hostConn = null; }
}
