import io
import os
from datetime import datetime
from xml.sax.saxutils import escape as xml_escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.graphics.shapes import Drawing, Rect, String, Circle
from reportlab.graphics.charts.barcharts import VerticalBarChart

_RL_FONT_DIR = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
F = "Helvetica"
FB = "Helvetica-Bold"


def _register_pdf_fonts() -> None:
    """Windows Arial veya ReportLab Vera; yoksa Helvetica (Türkçe için Vera tercih edilir)."""
    global F, FB
    candidates = [
        ("Arial", os.path.join("C:/Windows/Fonts/arial.ttf"), "ArialB", os.path.join("C:/Windows/Fonts/arialbd.ttf")),
        ("Vera", os.path.join(_RL_FONT_DIR, "Vera.ttf"), "VeraBd", os.path.join(_RL_FONT_DIR, "VeraBd.ttf")),
    ]
    for reg_name, reg_path, bold_name, bold_path in candidates:
        if os.path.isfile(reg_path) and os.path.isfile(bold_path):
            try:
                pdfmetrics.registerFont(TTFont(reg_name, reg_path))
                pdfmetrics.registerFont(TTFont(bold_name, bold_path))
                F, FB = reg_name, bold_name
                return
            except Exception:
                continue


_register_pdf_fonts()

_style_seq = 0


def _next_style_name() -> str:
    global _style_seq
    _style_seq += 1
    return f"rlps{_style_seq}"


def _xml(s) -> str:
    """ReportLab Paragraph mini-HTML içine gömülen düz metinler için."""
    if s is None:
        return ""
    return xml_escape(str(s), entities={'"': "&quot;"})


def _join_skills_xml(items: list) -> str:
    if not items:
        return ""
    return " &bull; ".join(_xml(x) for x in items)

C_PRIMARY = "#0f172a"
C_ACCENT = "#3b82f6"
C_PURPLE = "#8b5cf6"
C_MUTED = "#64748b"
C_BORDER = "#cbd5e1"
C_LIGHT = "#f1f5f9"
C_WHITE = "#ffffff"
C_DARK_BG = "#1e293b"

PAGE_W = A4[0] - 4.4 * cm


def _clr(score):
    if score >= 80: return "#059669"
    if score >= 60: return "#2563eb"
    if score >= 40: return "#d97706"
    return "#dc2626"


def _lbl(score):
    if score >= 80: return "Cok Uygun"
    if score >= 60: return "Uygun"
    if score >= 40: return "Kismen Uygun"
    return "Dusuk Uyum"


def _p(text, font=None, size=10, color=C_PRIMARY, bold=False, align=0, leading=None, after=0):
    fn = FB if bold else (font or F)
    return Paragraph(text, ParagraphStyle(
        _next_style_name(), fontName=fn, fontSize=size,
        textColor=colors.HexColor(color), alignment=align,
        leading=leading or size + 5, spaceAfter=after,
    ))


def _heading(text):
    return [
        Spacer(1, 16),
        Table(
            [[_p(f'<font color="{C_ACCENT}">&bull;</font>&nbsp;&nbsp;{text}', bold=True, size=12, color=C_PRIMARY)]],
            colWidths=[PAGE_W],
            style=TableStyle([
                ("PADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -1), 2, colors.HexColor(C_ACCENT)),
            ]),
        ),
        Spacer(1, 10),
    ]


def _score_bar_drawing(score, width=200, height=16):
    d = Drawing(width, height)
    d.add(Rect(0, 2, width, height - 4,
               fillColor=colors.HexColor("#e2e8f0"),
               strokeColor=None, rx=6, ry=6))
    fill_w = max(int(width * score / 100), 4)
    fill_clr = _clr(score)
    d.add(Rect(0, 2, fill_w, height - 4,
               fillColor=colors.HexColor(fill_clr),
               strokeColor=None, rx=6, ry=6))
    return d


def _score_indicator(score, size=90):
    d = Drawing(size, size)
    cx, cy = size / 2, size / 2
    r = size / 2 - 4
    d.add(Circle(cx, cy, r,
                 fillColor=None,
                 strokeColor=colors.HexColor("#e2e8f0"),
                 strokeWidth=6))
    d.add(Circle(cx, cy, r,
                 fillColor=None,
                 strokeColor=colors.HexColor(_clr(score)),
                 strokeWidth=6))
    d.add(String(cx, cy - 6,
                 f'{score:.0f}',
                 fontSize=22, fontName=FB,
                 fillColor=colors.HexColor(_clr(score)),
                 textAnchor='middle'))
    d.add(String(cx, cy - 20,
                 '/100',
                 fontSize=8, fontName=F,
                 fillColor=colors.HexColor(C_MUTED),
                 textAnchor='middle'))
    return d


def generate_match_report(match_result: dict, cv_data: dict, job_data: dict) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2.2 * cm, rightMargin=2.2 * cm,
        topMargin=2 * cm, bottomMargin=1.5 * cm,
    )

    elements = []
    scores = match_result["scores"]
    overall = scores["overall"]
    detail = match_result.get("detail") or {}
    skill_detail = detail.get("skill_detail") or {}
    lang_detail = detail.get("language_detail") or {}
    edu_detail = detail.get("education") or {}
    exp_detail = detail.get("experience") or {}

    header_bar = Table(
        [[
            Table(
                [[
                    _p('<font color="#3b82f6">CVMatch</font> <font color="#8b5cf6">AI</font>',
                       bold=True, size=22),
                ]],
                colWidths=[PAGE_W * 0.5],
                style=TableStyle([("PADDING", (0, 0), (-1, -1), 0)]),
            ),
            Table(
                [[
                    _p(datetime.now().strftime("%d.%m.%Y %H:%M"), size=9, color=C_MUTED, align=TA_RIGHT),
                ],
                [
                    _p('Eslestirme Raporu', size=8, color=C_MUTED, align=TA_RIGHT),
                ]],
                colWidths=[PAGE_W * 0.5],
                style=TableStyle([("PADDING", (0, 0), (-1, -1), 1)]),
            ),
        ]],
        colWidths=[PAGE_W * 0.5, PAGE_W * 0.5],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING", (0, 0), (-1, -1), 0),
        ]),
    )
    elements.append(header_bar)
    elements.append(Spacer(1, 4))

    gradient_line = Table(
        [[""]],
        colWidths=[PAGE_W],
        rowHeights=[3],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(C_ACCENT)),
            ("PADDING", (0, 0), (-1, -1), 0),
        ]),
    )
    elements.append(gradient_line)
    elements.append(Spacer(1, 18))

    sc = _clr(overall)
    score_drawing = _score_indicator(overall, 100)

    score_table = Table(
        [[
            score_drawing,
            Table(
                [
                    [_p(f'{_lbl(overall)}', bold=True, size=18, color=sc)],
                    [Spacer(1, 6)],
                    [_p(f'Aday: <b>{_xml(match_result.get("cv_name") or "-")}</b>', size=11, color=C_PRIMARY)],
                    [_p(
                        f'Ilan: <b>{_xml(job_data.get("title") or "-")}</b>'
                        f'{" - " + _xml(job_data["company"]) if job_data.get("company") else ""}',
                        size=10, color=C_MUTED,
                    )],
                ],
                colWidths=[PAGE_W - 6 * cm],
                style=TableStyle([("PADDING", (0, 0), (-1, -1), 2), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]),
            ),
        ]],
        colWidths=[5.2 * cm, PAGE_W - 5.2 * cm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f9ff")),
            ("BOX", (0, 0), (-1, -1), 1.2, colors.HexColor("#bfdbfe")),
            ("ROUNDEDCORNERS", [8, 8, 8, 8]),
            ("TOPPADDING", (0, 0), (-1, -1), 18),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 18),
            ("LEFTPADDING", (0, 0), (-1, -1), 16),
            ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ]),
    )
    elements.append(score_table)

    elements.extend(_heading("Kategori Puanlari"))

    cats = [
        ("Beceriler", scores["skills"]),
        ("Deneyim", scores["experience"]),
        ("Egitim", scores["education"]),
        ("Diller", scores["languages"]),
    ]

    header_s = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=9, textColor=colors.white)
    th2 = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=9, textColor=colors.white, alignment=TA_CENTER)
    th3 = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=9, textColor=colors.white, alignment=TA_CENTER)
    cat_data = [[
        Paragraph("Kategori", header_s),
        Paragraph("Puan", th2),
        Paragraph("Grafik", th3),
        Paragraph("Durum", header_s),
    ]]
    for name, val in cats:
        cat_data.append([
            _p(name, bold=True, size=10),
            _p(f'<font color="{_clr(val)}"><b>{val:.0f}%</b></font>', size=11, align=TA_CENTER),
            _score_bar_drawing(val, width=120, height=14),
            _p(_lbl(val), size=9, color=_clr(val)),
        ])

    cat_table = Table(cat_data, colWidths=[PAGE_W * 0.22, PAGE_W * 0.15, PAGE_W * 0.38, PAGE_W * 0.25])
    cat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(C_PRIMARY)),
        ("PADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(C_BORDER)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(C_LIGHT)]),
    ]))
    elements.append(cat_table)

    elements.extend(_heading("Beceri Analizi"))

    matched_req = skill_detail.get("matched_required", [])
    matched_pref = skill_detail.get("matched_preferred", [])
    missing_req = skill_detail.get("missing_required", [])
    missing_pref = skill_detail.get("missing_preferred", [])

    has_detail = matched_req or matched_pref or missing_req or missing_pref

    if not has_detail:
        m_all = match_result.get("matched_skills", [])
        x_all = match_result.get("missing_skills", [])
        if m_all:
            elements.append(
                _p(f'<b>Eslesen:</b> <font color="#059669">{_join_skills_xml(m_all)}</font>', size=10, after=6)
            )
        if x_all:
            elements.append(
                _p(f'<b>Eksik:</b> <font color="#dc2626">{_join_skills_xml(x_all)}</font>', size=10, after=6)
            )
        if not m_all and not x_all:
            elements.append(_p("Beceri detayi bulunamadi", size=10, color=C_MUTED))
    else:
        skill_rows = []
        if matched_req:
            skill_rows.append([
                _p('<font color="#059669"><b>&#10003;</b></font>&nbsp;&nbsp;Zorunlu Eslesen', bold=True, size=9, color="#059669"),
                _p(f'<font color="#059669">{_join_skills_xml(matched_req)}</font>', size=10),
            ])
        if matched_pref:
            skill_rows.append([
                _p('<font color="#0891b2"><b>&#10003;</b></font>&nbsp;&nbsp;Tercih Edilen Eslesen', bold=True, size=9, color="#0891b2"),
                _p(f'<font color="#0891b2">{_join_skills_xml(matched_pref)}</font>', size=10),
            ])
        if missing_req:
            skill_rows.append([
                _p('<font color="#dc2626"><b>&#10007;</b></font>&nbsp;&nbsp;Zorunlu Eksik', bold=True, size=9, color="#dc2626"),
                _p(f'<font color="#dc2626">{_join_skills_xml(missing_req)}</font>', size=10),
            ])
        if missing_pref:
            skill_rows.append([
                _p('<font color="#d97706"><b>&#9675;</b></font>&nbsp;&nbsp;Tercih Edilen Eksik', bold=True, size=9, color="#d97706"),
                _p(f'<font color="#d97706">{_join_skills_xml(missing_pref)}</font>', size=10),
            ])

        if skill_rows:
            st = Table(skill_rows, colWidths=[PAGE_W * 0.38, PAGE_W * 0.62])
            st.setStyle(TableStyle([
                ("PADDING", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor(C_BORDER)),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(C_LIGHT)),
                ("ROUNDEDCORNERS", [6, 6, 6, 6]),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(C_BORDER)),
            ]))
            elements.append(st)

    if edu_detail or exp_detail:
        elements.extend(_heading("Egitim ve Deneyim Detayi"))

        st_e = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=1)
        st_e2 = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=9, textColor=colors.white, alignment=TA_CENTER)
        st_e3 = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=9, textColor=colors.white, alignment=TA_CENTER)
        st_e4 = ParagraphStyle(_next_style_name(), fontName=FB, fontSize=9, textColor=colors.white, alignment=TA_CENTER)
        ed_rows = [
            [
                Paragraph("", st_e),
                Paragraph("<b>CV</b>", st_e2),
                Paragraph("<b>Istenen</b>", st_e3),
                Paragraph("<b>Sonuc</b>", st_e4),
            ]
        ]

        if edu_detail:
            cv_edu_raw = ", ".join(edu_detail.get("cv_level", [])) or "-"
            cv_edu = _xml(cv_edu_raw)
            req_edu = _xml(str(edu_detail.get("required", "-") or "-"))
            edu_score = scores.get("education", 0)
            ed_rows.append([
                _p("Egitim", bold=True, size=10),
                _p(cv_edu, size=10, align=TA_CENTER),
                _p(req_edu, size=10, align=TA_CENTER),
                _score_bar_drawing(edu_score, width=80, height=12),
            ])

        if exp_detail:
            cv_yrs = exp_detail.get("cv_total_years")
            req_yrs = exp_detail.get("required_years")
            cv_s = f"{cv_yrs} yil" if cv_yrs is not None else "-"
            req_s = "Deneyimsiz" if req_yrs == 0 else (f"{req_yrs} yil" if req_yrs is not None else "-")
            exp_score = scores.get("experience", 0)
            ed_rows.append([
                _p("Deneyim", bold=True, size=10),
                _p(cv_s, size=10, align=TA_CENTER),
                _p(req_s, size=10, align=TA_CENTER),
                _score_bar_drawing(exp_score, width=80, height=12),
            ])

        if lang_detail:
            lang_m = lang_detail.get("matched", [])
            lang_x = lang_detail.get("missing", [])
            cv_lang_raw = ", ".join(lang_m) if lang_m else "-"
            cv_lang = _xml(cv_lang_raw)
            req_lang_parts = []
            for l in lang_m:
                req_lang_parts.append(f'<font color="#059669">&#10003; {_xml(l)}</font>')
            for l in lang_x:
                req_lang_parts.append(f'<font color="#dc2626">&#10007; {_xml(l)}</font>')
            lang_score = scores.get("languages", 0)
            if lang_m or lang_x:
                ed_rows.append([
                    _p("Diller", bold=True, size=10),
                    _p(cv_lang, size=10, align=TA_CENTER),
                    _p(" ".join(req_lang_parts) if req_lang_parts else "-", size=10, align=TA_CENTER),
                    _score_bar_drawing(lang_score, width=80, height=12),
                ])

        if len(ed_rows) > 1:
            et = Table(ed_rows, colWidths=[PAGE_W * 0.20, PAGE_W * 0.28, PAGE_W * 0.28, PAGE_W * 0.24])
            et.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(C_PRIMARY)),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor(C_LIGHT)),
                ("PADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(C_BORDER)),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(C_LIGHT)]),
            ]))
            elements.append(et)

    suggestions = match_result.get("suggestions", [])
    if suggestions:
        elements.extend(_heading("CV Iyilestirme Onerileri"))
        for i, s in enumerate(suggestions, 1):
            sug_table = Table(
                [[
                    _p(f'<font color="#d97706"><b>{i}</b></font>', size=11, align=TA_CENTER),
                    _p(_xml(s), size=10, color="#334155"),
                ]],
                colWidths=[1.2 * cm, PAGE_W - 1.2 * cm],
                style=TableStyle([
                    ("PADDING", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#fffbeb")),
                    ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#fffef5")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#fde68a")),
                    ("ROUNDEDCORNERS", [4, 4, 4, 4]),
                ]),
            )
            elements.append(sug_table)
            elements.append(Spacer(1, 4))

    elements.append(Spacer(1, 16))
    summary_items = []
    summary_items.append(f'<b>Genel Puan:</b> <font color="{sc}">{overall:.0f}/100</font>')
    summary_items.append(f'<b>Durum:</b> <font color="{sc}">{_lbl(overall)}</font>')
    if matched_req:
        summary_items.append(f'<b>Eslesen Zorunlu:</b> {len(matched_req)}/{len(matched_req) + len(missing_req)}')
    if suggestions:
        summary_items.append(f'<b>Oneri Sayisi:</b> {len(suggestions)}')

    summary_text = "&nbsp;&nbsp;|&nbsp;&nbsp;".join(summary_items)
    summary_box = Table(
        [[_p(summary_text, size=9, color=C_PRIMARY, align=TA_CENTER)]],
        colWidths=[PAGE_W],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#86efac")),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("PADDING", (0, 0), (-1, -1), 10),
        ]),
    )
    elements.append(summary_box)

    elements.append(Spacer(1, 28))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(C_BORDER), spaceAfter=8))
    ft = Table(
        [[
            _p('CVMatch AI - Akilli CV Eslestirme Sistemi', size=7, color=C_MUTED),
            _p(datetime.now().strftime("%d.%m.%Y"), size=7, color=C_MUTED, align=TA_RIGHT),
        ]],
        colWidths=[PAGE_W * 0.5, PAGE_W * 0.5],
        style=TableStyle([("PADDING", (0, 0), (-1, -1), 0)]),
    )
    elements.append(ft)

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
