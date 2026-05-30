# dependency-graph-layout

`dependency-graph.html` の座標・グループ配置・エッジルートの管理用資料。
HTML を編集する前にここで位置関係を把握する。

---

## キャンバス (592 × 600 px)

```
x→  0    8   20                        372 382 392            572 580  592
y↓       VL  ┌────────── Frontend (App) w=552 ──────────────────┐  VR
  20         │                [openkk cx=296]                   │
  97         └──────────────────────────────────────────────────┘
 108  ─────────────────────────── H1 ──────────────────────────────────
 117         ┌────── Client w=352 ────────┐ ┌─ Client Adapters w=180 ─┐
             │  [client  cx=110] (空)     │ │ [emb-bk-adp cx=482]     │
 164         │  cy=164                    │ │  cy=164                  │
 212         │  [c-ui cx=110][c-ports 282]│ │ [print-adp  cx=482]     │
             │  cy=212                    │VM│  cy=212                  │
 260         │  [c-usc cx=110][c-dom 282] │ │                          │
             │  cy=260                    │ │                          │
 290         └────────────────────────────┘ └──────────────────────────┘
 300  ─────────────────────────── H2 ──────────────────────────────────
 310         ┌────────── Embedded Backend w=552 ──────────────────┐
             │             [embedded-backend cx=296]              │
 387         └──────────────────────────────────────────────────┘
 398  ─────────────────────────── H3 ──────────────────────────────────
 407         ┌────── Server w=352 ────────┐ ┌─ Server Adapters w=180 ─┐
             │  [server  cx=110] (空)     │ │ [file-db-adp cx=482]    │
 454         │  cy=454                    │ │  cy=454                  │
 502         │  [s-api cx=110][s-ports 282│ │ [mem-db-adp  cx=482]    │
             │  cy=502                    │VM│  cy=502                  │
 550         │  [s-usc cx=110][s-dom  282]│ │                          │
             │  cy=550                    │ │                          │
 580         └────────────────────────────┘ └──────────────────────────┘
 600
```

---

## 経路コリドー

| 名前 | 座標  | 役割                                            |
|------|-------|-------------------------------------------------|
| VL   | x=8   | 左端縦断（openkk ↔ embedded-backend 迂回用）    |
| VR   | x=580 | 右端縦断（openkk → Server Adapters 迂回用）     |
| VM   | x=382 | Client/Server グループと Adapters の間の縦断    |
| H1   | y=108 | Frontend と Client/CA 行の間の横断             |
| H2   | y=300 | Client/CA 行と Embedded Backend の間の横断     |
| H3   | y=398 | Embedded Backend と Server/SA 行の間の横断     |

---

## エッジルート一覧

HTML の EDGES 配列と 1:1 対応。座標は `x1,y1, x2,y2, ...` の順。

### cross-group（手動ルート）

```
openkk → client
  ↓H1 ←left ↓client
  296,83 → 296,108 → 110,108 → 110,148

openkk → emb_bk_adp
  ↓H1 →right ↓top
  296,83 → 296,108 → 482,108 → 482,148

openkk → print_adp
  →VR ↓ ←right
  372,67 → 580,67 → 580,212 → 558,212

openkk → emb_bk
  ←VL ↓ →left  (Client 行を左から迂回)
  220,67 → 8,67 → 8,357 → 220,357

openkk → file_db_adp
  →VR ↓ ←right
  372,67 → 580,67 → 580,454 → 558,454

openkk → mem_db_adp
  →VR ↓ ←right
  372,67 → 580,67 → 580,502 → 558,502

emb_bk_adp → client_ports
  ←VM ↓ →right
  406,164 → 382,164 → 382,212 → 358,212

emb_bk_adp → emb_bk
  ↓H2 ←center ↓top
  482,180 → 482,300 → 296,300 → 296,341

print_adp → client_ports
  ←VM →right  (水平)
  406,212 → 382,212 → 358,212

emb_bk → server
  ↓H3 ←left ↓top
  296,373 → 296,398 → 110,398 → 110,438

file_db_adp → server_ports
  ←VM ↓ →right
  406,454 → 382,454 → 382,502 → 358,502

file_db_adp → server_domain
  ←VM ↓ →right
  406,454 → 382,454 → 382,550 → 358,550

mem_db_adp → server_ports
  ←VM →right  (水平)
  406,502 → 382,502 → 358,502

mem_db_adp → server_domain
  ←VM ↓ →right
  406,502 → 382,502 → 382,550 → 358,550
```

### within-group（自動 port-to-port）

Client 内・Server 内の全エッジ。座標指定なし → JS が自動計算。

```
client → client_ui, client_usecases, client_ports, client_domain
client_ui → client_usecases, client_domain
client_usecases → client_ports, client_domain
client_ports → client_domain

server → server_api, server_usecases, server_ports, server_domain
server_api → server_usecases, server_ports, server_domain
server_usecases → server_ports, server_domain
server_ports → server_domain
```
