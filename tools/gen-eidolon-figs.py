# -*- coding: utf-8 -*-
"""
Figuras SVG do guia de Eidolon, uma versão por idioma do artigo.

Desenho MOBILE-FIRST de propósito: a arte tem 400 unidades de largura, então num
celular de 390px ela renderiza quase 1:1 (o corpo do texto sai a ~10px em vez dos
5,5px que uma figura de 720 daria). No desktop ela aparece no tamanho natural,
centralizada na coluna do artigo, com o texto do tamanho da prosa.

Saída: `public/img/nightwave/<fig>.svg` (pt) e `public/img/nightwave/<lang>/<fig>.svg`.
Rodar de novo é idempotente. Ao mudar uma figura, troque o `?v=` que os artigos
usam: a borda segura imagem por horas.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "public", "img", "nightwave")
BG, PANEL, PANEL2 = "#0b0e17", "#151b2c", "#111624"
LINE, GOLD, GOLDB = "#232c42", "#cfae66", "#e8ce8f"
CYAN, TEXT, DIM, FAINT = "#6ee7f2", "#e9ecf5", "#9aa5bc", "#6b7590"
DANGER = "#e36d5d"
# a Exo 2 self-hosted não vale dentro de <img>: a pilha aqui é de fonte de sistema,
# com CJK no fim para o chinês não cair em tofu.
FONT = ("'Exo 2','Segoe UI',Roboto,Helvetica,Arial,"
        "'Noto Sans CJK SC','Microsoft YaHei','PingFang SC',sans-serif")
W, M = 400, 20
CW = W - 2 * M
BOT = 18            # respiro embaixo, para a borda do rodapé não encostar na moldura

# ---------------------------------------------------------------- textos
T = {
    "pt": {
        "cadeia": {
            "aria": "A cadeia do Tridolon: Teralyst, Gantulyst e Hydrolyst",
            "title": "A CADEIA DO TRIDOLON", "sub": "o Hidrolista é o último elo",
            "cards": [
                (CYAN, "1 · TERALYST", "nível 50 · 4 sinóvias",
                 ["CAPTURE com 2 lures carregados.", "Só a captura solta o fragmento Brilhante."]),
                (CYAN, "2 · GANTULYST", "nível 55 · 6 sinóvias",
                 ["CAPTURE com 3 lures carregados.", "Só a captura solta o fragmento Radiante."]),
                (GOLDB, "3 · HYDROLYST", "nível 60 · 6 sinóvias",
                 ["Aqui MATAR já fecha o ato.", "Capturar só aumenta o prêmio."]),
            ],
            "conns": [["ofereça o fragmento BRILHANTE", "no santuário do lago Gara Toht"],
                      ["ofereça o fragmento RADIANTE", "no mesmo santuário"]],
            "foot": ("SEM CAPTURA A CORRENTE PARA",
                     ["Matar o Teralyst sem lure carregado", "encerra a noite ali mesmo."]),
        },
        "luta": {
            "aria": "O ciclo de uma luta de Eidolon",
            "title": "O CICLO DA LUTA", "sub": "repete uma vez por sinóvia",
            "steps": [
                (CYAN, "1 · ESCUDO SENTIENT", ["Arma de warframe não arranha.",
                                               "Só o dano Void do amp do Operador."]),
                (CYAN, "2 · SINÓVIAS EXPOSTAS", ["Escudo zerado: as juntas brilhantes",
                                                 "aceitam todo dano. Janela do sniper."]),
                (GOLD, "3 · SINÓVIA QUEBRADA", ["-20% da vida, cai um Sentient Core e",
                                                "vem proc magnético num raio de 60 m."]),
                (GOLD, "4 · O ESCUDO VOLTA", ["75% sem lure carregado por perto,",
                                              "50% e sem teleporte se houver um."]),
            ],
            "foot": ("CAIU A ÚLTIMA SINÓVIA",
                     ["O corpo fica vulnerável: matar, ou capturar", "com os lures presos nele."]),
        },
        "lure": {
            "aria": "Como conseguir e carregar um Eidolon Lure",
            "title": "O LURE, PASSO A PASSO", "sub": "sem lure carregado não existe captura",
            "steps": [
                ("ACHE", ["Lures ficam nos acampamentos Grineer",
                          "das Planícies e só aparecem à noite."]),
                ("HACKEIE", ["Atire até desabilitar e hackeie.",
                             "Depois disso ele te segue pelo mapa."]),
                ("CARREGUE", ["3 Vomvalysts por lure: forma física",
                              "com arma, espectral com o Operador."]),
                ("USE", ["Cada sinóvia quebrada vira um feixe",
                         "laranja do lure. Sem feixe, sem captura."]),
            ],
            "foot": ("LEVE 3 OU 4, NUNCA O MÍNIMO",
                     ["O Eidolon atira no lure e ele morre. Trinity,",
                      "Oberon e o Sancti Magistar curam lure."]),
        },
        "noite": {
            "aria": "Roteiro de uma noite nas Planícies de Eidolon",
            "title": "A NOITE DURA 50 MINUTOS", "sub": "o dia seguinte custa 100 minutos de espera",
            "unit": "%d min",
            "marks": [
                (0, CYAN, "lures", "hackeie 3 ou 4 e carregue cada um"),
                (8, GOLD, "Teralyst", "capture com 2 lures presos"),
                (20, GOLD, "Gantulyst", "fragmento Brilhante no santuário"),
                (34, GOLDB, "Hidrolista", "fragmento Radiante no santuário"),
                (50, DANGER, "amanhece", "quem sobrou vira invulnerável"),
            ],
            "foot": ("ROTEIRO FOLGADO, NÃO É REGRA DO JOGO",
                     ["Esquadrão treinado fecha os três em 6 a 10 min.",
                      "O relógio de Cetus fica na home do site."]),
        },
    },
    "zh": {
        "cadeia": {
            "aria": "Tridolon 链条：巨力使、岩力使、水力使",
            "title": "TRIDOLON 的链条", "sub": "水力使是最后一环",
            "cards": [
                (CYAN, "1 · 巨力使 TERALYST", "等级 50 · 4 个滑膜",
                 ["用 2 个充能诱捕器捕获。", "只有捕获才会掉闪亮碎片。"]),
                (CYAN, "2 · 岩力使 GANTULYST", "等级 55 · 6 个滑膜",
                 ["用 3 个充能诱捕器捕获。", "只有捕获才会掉光辉碎片。"]),
                (GOLDB, "3 · 水力使 HYDROLYST", "等级 60 · 6 个滑膜",
                 ["这一只打死就算完成挑战。", "捕获只是奖励更高。"]),
            ],
            "conns": [["在加拉·托特湖中央的祭坛", "献上闪亮的夜灵碎片"],
                      ["在同一个祭坛", "献上光辉的夜灵碎片"]],
            "foot": ("不捕获，链子就断了",
                     ["没有充能诱捕器就打死巨力使，", "这个夜晚到此为止。"]),
        },
        "luta": {
            "aria": "夜灵战斗的循环",
            "title": "战斗的循环", "sub": "每破一个滑膜就重来一次",
            "steps": [
                (CYAN, "1 · 五角神使护盾", ["战甲武器完全无效。",
                                            "只有指挥官增幅器的虚空伤害。"]),
                (CYAN, "2 · 滑膜暴露", ["护盾清零：发光的关节",
                                        "吃所有伤害。这是狙击枪的窗口。"]),
                (GOLD, "3 · 滑膜被破坏", ["扣 20% 生命，掉一个神使核心，",
                                          "并在 60 米内造成磁力异常。"]),
                (GOLD, "4 · 护盾回来了", ["附近没有充能诱捕器回 75%，",
                                          "有的话只回 50% 且不会瞬移。"]),
            ],
            "foot": ("最后一个滑膜破了",
                     ["本体变脆弱：击杀，或者用锁住它的", "诱捕器捕获。"]),
        },
        "lure": {
            "aria": "如何获得并给夜灵诱捕器充能",
            "title": "诱捕器，一步一步", "sub": "没有充能诱捕器就没有捕获",
            "steps": [
                ("找到", ["诱捕器在平野的 Grineer 营地，",
                           "而且只在夜里出现。"]),
                ("入侵", ["打到它瘫痪，然后入侵。",
                           "之后它会在地图上跟着你。"]),
                ("充能", ["每个诱捕器 3 只 Vomvalyst：",
                           "实体用枪打，灵体用指挥官。"]),
                ("使用", ["每破一个滑膜，诱捕器会射出",
                           "橙色光束。没有光束就没有捕获。"]),
            ],
            "foot": ("带 3 到 4 个，别只带最低数",
                     ["夜灵会打诱捕器，它会死。Trinity、",
                      "Oberon 和圣洁·执法者都能奶它。"]),
        },
        "noite": {
            "aria": "夜灵平野一个夜晚的行程",
            "title": "一个夜晚只有 50 分钟", "sub": "错过了要再等 100 分钟的白天",
            "unit": "%d 分",
            "marks": [
                (0, CYAN, "诱捕器", "入侵 3 到 4 个并各自充满"),
                (8, GOLD, "巨力使", "用 2 个锁住的诱捕器捕获"),
                (20, GOLD, "岩力使", "在祭坛献上闪亮碎片"),
                (34, GOLDB, "水力使", "在祭坛献上光辉碎片"),
                (50, DANGER, "天亮", "还活着的会变成无敌"),
            ],
            "foot": ("留了余量的行程，不是游戏规则",
                     ["熟练的队伍 6 到 10 分钟就打完三只。",
                      "希图斯的时钟在本站首页。"]),
        },
    },
}

# ---------------------------------------------------------------- primitivas
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def head(h, title):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
            'role="img" aria-label="%s" font-family="%s">\n'
            '<rect width="%d" height="%d" fill="%s"/>\n'
            '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" '
            'markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="%s"/></marker></defs>\n'
            % (W, h, W, h, esc(title), esc(FONT), W, h, BG, GOLD))

def chamfer(x, y, w, h, c=10, fill=PANEL, stroke=LINE, sw=1):
    d = "M%g %g H%g L%g %g V%g H%g Z" % (x, y, x + w - c, x + w, y + c, y + h, x)
    return '<path d="%s" fill="%s" stroke="%s" stroke-width="%g"/>\n' % (d, fill, stroke, sw)

def txt(x, y, s, size=13, fill=TEXT, weight="400", anchor="start", ls="0"):
    return ('<text x="%g" y="%g" font-size="%g" fill="%s" font-weight="%s" '
            'text-anchor="%s" letter-spacing="%s">%s</text>\n'
            % (x, y, size, fill, weight, anchor, ls, esc(s)))

def lines(x, y, rows, size=13, fill=DIM, lh=17, weight="400"):
    return "".join(txt(x, y + i * lh, r, size, fill, weight) for i, r in enumerate(rows))

def vline(x, y1, y2, color=GOLD):
    return ('<path d="M%g %g L%g %g" stroke="%s" stroke-width="1.6" fill="none" '
            'marker-end="url(#a)"/>\n' % (x, y1, x, y2, color))

def title_bar(t, sub, ls="0.10em"):
    return txt(M, 28, t, 14, GOLD, "700", ls=ls) + txt(M, 48, sub, 12, FAINT)

def footer(y, spec, ls="0.06em"):
    head_txt, rows = spec
    h = 34 + 17 * len(rows)
    s = chamfer(M, y, CW, h, 10, fill=PANEL2, stroke="rgba(207,174,102,0.42)")
    s += txt(M + 14, y + 22, head_txt, 11.5, GOLDB, "700", ls=ls)
    s += lines(M + 14, y + 42, rows, 12.5, DIM, 17)
    return s, y + h

# ---------------------------------------------------------------- figuras
def fig_cadeia(d, ls):
    ch, gap, y0 = 92, 60, 66
    s = title_bar(d["title"], d["sub"], ls)
    y = y0
    for i, (col, t, meta, body) in enumerate(d["cards"]):
        s += chamfer(M, y, CW, ch, 10)
        s += '<rect x="%g" y="%g" width="3" height="%g" fill="%s"/>\n' % (M, y, ch, col)
        s += txt(M + 14, y + 24, t, 14.5, col, "700")
        s += txt(M + 14, y + 42, meta, 11.5, FAINT)
        s += lines(M + 14, y + 62, body, 12.5, DIM, 16)
        y += ch
        if i < 2:
            s += vline(M + 22, y + 8, y + gap - 8)
            s += lines(M + 36, y + 24, d["conns"][i], 12, GOLD, 15)
            y += gap
    f, end = footer(y + 16, d["foot"], ls)
    return s + f, end + BOT

def fig_luta(d, ls):
    ch, gap, y0 = 76, 26, 66
    s = title_bar(d["title"], d["sub"], ls)
    y = y0
    for i, (col, t, body) in enumerate(d["steps"]):
        s += chamfer(M, y, CW, ch, 10)
        s += '<rect x="%g" y="%g" width="3" height="%g" fill="%s"/>\n' % (M, y, ch, col)
        s += txt(M + 14, y + 24, t, 14, col, "700")
        s += lines(M + 14, y + 46, body, 12.5, DIM, 16)
        y += ch
        if i < 3:
            s += vline(M + 22, y + 5, y + gap - 5)
            y += gap
    # a seta tracejada na borda fecha o laço do passo 4 de volta no 1
    s += ('<path d="M%g %g H%g V%g H%g" stroke="%s" stroke-width="1.4" fill="none" '
          'stroke-dasharray="4 4" marker-end="url(#a)"/>\n'
          % (W - M + 4, y - ch / 2, W - 8, y0 + ch / 2, W - M + 2, GOLD))
    f, end = footer(y + 16, d["foot"], ls)
    return s + f, end + BOT

def fig_lure(d, ls):
    ch, gap, y0 = 74, 22, 66
    s = title_bar(d["title"], d["sub"], ls)
    y = y0
    for i, (t, body) in enumerate(d["steps"]):
        s += chamfer(M, y, CW, ch, 10)
        s += '<circle cx="%g" cy="%g" r="11" fill="none" stroke="%s"/>\n' % (M + 24, y + 26, CYAN)
        s += txt(M + 24, y + 30, str(i + 1), 12.5, CYAN, "700", anchor="middle")
        s += txt(M + 44, y + 30, t, 14, CYAN, "700", ls=ls)
        s += lines(M + 14, y + 50, body, 12.5, DIM, 16)
        y += ch
        if i < 3:
            s += vline(M + 24, y + 4, y + gap - 4)
            y += gap
    f, end = footer(y + 16, d["foot"], ls)
    return s + f, end + BOT

def fig_noite(d, ls):
    y0, step = 74, 56
    marks = d["marks"]
    s = title_bar(d["title"], d["sub"], ls)
    x = M + 54
    s += '<path d="M%g %g V%g" stroke="%s" stroke-width="2"/>\n' % (
        x, y0 - 4, y0 + step * (len(marks) - 1) + 4, LINE)
    for i, (mm, col, label, body) in enumerate(marks):
        y = y0 + i * step
        s += '<circle cx="%g" cy="%g" r="6" fill="%s" stroke="%s" stroke-width="2"/>\n' % (
            x, y, BG, col)
        s += txt(M + 40, y + 5, d["unit"] % mm, 12, col, "700", anchor="end")
        s += txt(x + 18, y + 1, label, 14, col, "700")
        s += txt(x + 18, y + 19, body, 12, DIM)
    f, end = footer(y0 + step * (len(marks) - 1) + 30, d["foot"], ls)
    return s + f, end + BOT

FIGS = [("eidolon-cadeia.svg", "cadeia", fig_cadeia),
        ("eidolon-ciclo-luta.svg", "luta", fig_luta),
        ("eidolon-lure.svg", "lure", fig_lure),
        ("eidolon-noite.svg", "noite", fig_noite)]

for lang, tabela in T.items():
    # o chinês não leva letter-spacing: espaçar ideograma abre buraco no meio da palavra
    ls = "0" if lang == "zh" else None
    outdir = OUT if lang == "pt" else os.path.join(OUT, lang)
    os.makedirs(outdir, exist_ok=True)
    for (name, key, fn) in FIGS:
        body, h = fn(tabela[key], ls if ls is not None else "0.10em")
        body = head(h, tabela[key]["aria"]) + body
        p = os.path.join(outdir, name)
        open(p, "w", encoding="utf-8").write(body + "</svg>\n")
        print("escrito:", p, os.path.getsize(p), "bytes")
