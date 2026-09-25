import re
import fitz  # PyMuPDF kütüphanesi


def _detect_columns(text_blocks, page_width):
    if len(text_blocks) < 4:
        return False, page_width * 0.5

    step = page_width / 100
    coverage = [0] * 100

    for b in text_blocks:
        x0_bin = max(0, int(b[0] / step))
        x2_bin = min(99, int(b[2] / step))
        for bi in range(x0_bin, x2_bin + 1):
            coverage[bi] += 1

    best_start = -1
    best_len = 0
    cur_start = -1
    cur_len = 0

    for i in range(10, 90):
        if coverage[i] == 0:
            if cur_start == -1:
                cur_start = i
                cur_len = 1
            else:
                cur_len += 1
        else:
            if cur_len > best_len:
                best_start = cur_start
                best_len = cur_len
            cur_start = -1
            cur_len = 0
    if cur_len > best_len:
        best_start = cur_start
        best_len = cur_len

    if best_len < 2:
        return False, page_width * 0.5

    divider_x = (best_start + best_len / 2) * step

    left_count = sum(1 for b in text_blocks if (b[0] + b[2]) / 2 < divider_x)
    right_count = len(text_blocks) - left_count

    if left_count >= 2 and right_count >= 2:
        return True, divider_x

    return False, page_width * 0.5


def _group_blocks_by_columns(blocks, page_width, divider_x):
    text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
    if not text_blocks:
        return ""

    left_blocks = []
    right_blocks = []

    for b in text_blocks:
        center_x = (b[0] + b[2]) / 2
        if center_x < divider_x:
            left_blocks.append(b)
        else:
            right_blocks.append(b)

    left_blocks.sort(key=lambda b: (b[1], b[0]))
    right_blocks.sort(key=lambda b: (b[1], b[0]))

    lines = []
    for b in left_blocks:
        lines.append(b[4].strip())
    lines.append("")
    for b in right_blocks:
        lines.append(b[4].strip())

    return "\n".join(lines)


def _collapse_spaced_line(line: str) -> str:
    stripped = line.strip()
    if not stripped or len(stripped) < 5:
        return line

    tokens = [t for t in stripped.split(" ") if t]
    if len(tokens) < 3:
        return line

    single_count = sum(1 for t in tokens if len(t) == 1)
    if single_count / len(tokens) < 0.7:
        return line

    collapsed = "".join(tokens)

    result = []
    for i, ch in enumerate(collapsed):
        if i > 0 and ch.isupper() and collapsed[i - 1].islower():
            result.append(" ")
        result.append(ch)

    return "".join(result)


def _clean_text(text: str) -> str:
    lines = text.split("\n")
    merged = []
    skip_next = False

    for i, line in enumerate(lines):
        if skip_next:
            skip_next = False
            continue

        stripped = line.strip()

        stripped = _collapse_spaced_line(stripped)

        if i + 1 < len(lines):
            next_stripped = lines[i + 1].strip()
            next_stripped = _collapse_spaced_line(next_stripped)
            if (re.search(r"[-–]\s*\w+$", stripped)
                    and re.match(r"^(19|20)\d{2}$", next_stripped)):
                merged.append(stripped + " " + next_stripped)
                skip_next = True
                continue

        cleaned = re.sub(r"[ \t]{2,}", " ", stripped)
        merged.append(cleaned)

    return "\n".join(merged)


def _extract_links(page) -> str:
    links = page.get_links()
    extras = []
    for link in links:
        uri = link.get("uri", "")
        if uri:
            if uri.startswith("mailto:"):
                extras.append(uri.replace("mailto:", ""))
            elif "@" in uri:
                extras.append(uri)
    return "\n".join(extras) if extras else ""


def _has_personal_contact(text: str) -> bool:
    has_email = bool(re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text))
    if has_email:
        return True

    phone_pattern = r"(?:\+90|0)[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}"
    for line in text.split("\n"):
        stripped = line.strip().lower()
        if stripped.startswith("tel:") or stripped.startswith("tel "):
            continue
        if re.search(phone_pattern, line):
            return True

    return False


COMMON_DOMAINS = {
    "gmail": "gmail.com",
    "hotmail": "hotmail.com",
    "yahoo": "yahoo.com",
    "outlook": "outlook.com",
    "icloud": "icloud.com",
    "yandex": "yandex.com",
}


def _fix_ocr_email(raw: str) -> str:
    if "@" not in raw:
        return raw

    raw = raw.strip().replace(" ", "")
    user_raw, _, domain_raw = raw.partition("@")

    upper_digit_map = {"O": "0", "G": "6", "I": "1", "S": "5", "B": "8"}
    fixed_chars = []
    for i, ch in enumerate(user_raw):
        if ch.isupper() and i > 0:
            prev = user_raw[i - 1] if i > 0 else ""
            nxt = user_raw[i + 1] if i + 1 < len(user_raw) else ""
            if prev.islower() or prev.isdigit() or nxt.islower() or nxt.isdigit():
                fixed_chars.append(upper_digit_map.get(ch, ch.lower()))
                continue
        fixed_chars.append(ch)
    user = "".join(fixed_chars).lower()

    chars = list(user)
    for i, ch in enumerate(chars):
        if ch == "o":
            prev = chars[i - 1] if i > 0 else ""
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            if (prev.isdigit() or nxt.isdigit()):
                chars[i] = "0"
    user = "".join(chars)

    domain = domain_raw.lower()

    from difflib import SequenceMatcher
    best_ratio = 0.0
    best_domain = domain
    full_domains = list(COMMON_DOMAINS.values())
    for d in full_domains:
        ratio = SequenceMatcher(None, domain, d).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_domain = d

    if best_ratio < 0.35:
        best_domain = domain

    return f"{user}@{best_domain}"


def _ocr_header(page, height=150) -> str:
    try:
        import easyocr
    except ImportError:
        return ""

    try:
        clip = fitz.Rect(0, 0, page.rect.width, height)
        mat = fitz.Matrix(4, 4)
        pix = page.get_pixmap(matrix=mat, clip=clip)

        img_bytes = pix.tobytes("png")

        reader = easyocr.Reader(["tr", "en"], gpu=False, verbose=False)
        results = reader.readtext(img_bytes)

        ocr_lines = []
        for _, text, conf in results:
            text = text.strip()
            if not text:
                continue

            if "@" in text:
                text = _fix_ocr_email(text)
                ocr_lines.append(text)
            elif conf > 0.3:
                ocr_lines.append(text)

        return "\n".join(ocr_lines)
    except Exception:
        return ""


def extract_name_by_font(file_path: str) -> str | None:
    try:
        doc = fitz.open(file_path)
        page = doc[0]
        page_dict = page.get_text("dict")

        page_height = page.rect.height
        top_limit = page_height * 0.35

        _DIACRITICS = re.compile(r'^[˙˘¨ˆ˜¸˝˛˚ˇ½¼¾]+$')
        spans_with_size = []
        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    size = span.get("size", 0)
                    y_pos = span.get("origin", (0, 0))[1]
                    if text and size > 0 and y_pos < top_limit and not _DIACRITICS.match(text):
                        spans_with_size.append({
                            "text": text,
                            "size": round(size, 1),
                            "y": y_pos,
                        })

        doc.close()

        if not spans_with_size:
            return None

        max_size = max(s["size"] for s in spans_with_size)

        big_spans = [s for s in spans_with_size if s["size"] >= max_size * 0.9]
        big_spans.sort(key=lambda x: (x["y"], x.get("x", 0)))

        y_tolerance = 5.0
        grouped_lines = []
        current_group = []
        current_y = None

        for s in big_spans:
            if current_y is None or abs(s["y"] - current_y) <= y_tolerance:
                current_group.append(s["text"])
                current_y = s["y"] if current_y is None else current_y
            else:
                grouped_lines.append(" ".join(current_group))
                current_group = [s["text"]]
                current_y = s["y"]
        if current_group:
            grouped_lines.append(" ".join(current_group))

        skip_patterns = re.compile(
            r"([@\d]{3}|https?://|www\.|\.com|\.pdf|"
            r"curriculum|resume|özgeçmiş|powered|tcpdf)",
            re.IGNORECASE,
        )
        name_parts = []
        for raw_line in grouped_lines:
            t = _collapse_spaced_line(raw_line)
            if skip_patterns.search(t):
                continue
            if len(t.strip()) < 2 or len(t) > 40:
                continue
            name_parts.append(t.strip())

        if not name_parts:
            return None

        name = " ".join(name_parts).strip()

        name = re.sub(r'[˙˘¨ˆ˜¸˝˛˚ˇ½¼¾]', '', name)
        name = re.sub(r'\s{2,}', ' ', name).strip()

        if not name:
            return None

        if len(name.split()) > 5 or len(name) > 50:
            return None

        if len(name.split()) == 1 and len(name) > 3:
            split = re.sub(r"(?<=[a-zçğıöşü])(?=[A-ZÇĞİÖŞÜ])", " ", name)
            if 1 < len(split.split()) <= 4:
                name = split

        prev = None
        while name != prev:
            prev = name
            words = name.split()
            if len(words) <= 2:
                break
            merged = [words[0]]
            i = 1
            while i < len(words):
                if len(words[i]) <= 2 and i + 1 < len(words) and len(words[i + 1]) <= 3:
                    merged.append(words[i] + words[i + 1])
                    i += 2
                elif len(words[i]) <= 2 and merged:
                    merged[-1] = merged[-1] + words[i]
                    i += 1
                else:
                    merged.append(words[i])
                    i += 1
            name = " ".join(merged)

        return name

    except Exception:
        return None


def extract_text_from_pdf(file_path: str) -> str:
    doc = fitz.open(file_path)
    full_text = ""

    for page_num, page in enumerate(doc):
        page_width = page.rect.width
        blocks = page.get_text("blocks")
        text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]

        if not text_blocks:
            full_text += page.get_text("text") + "\n"
            continue

        is_two_col, divider_x = _detect_columns(text_blocks, page_width)
        if is_two_col:
            full_text += _group_blocks_by_columns(blocks, page_width, divider_x) + "\n"
        else:
            text_blocks.sort(key=lambda b: (b[1], b[0]))
            full_text += "\n".join(b[4].strip() for b in text_blocks) + "\n"

        link_text = _extract_links(page)
        if link_text:
            full_text += "\n" + link_text + "\n"

    if not _has_personal_contact(full_text):
        ocr_text = _ocr_header(doc[0])
        if ocr_text:
            full_text = ocr_text + "\n" + full_text

    doc.close()
    return _clean_text(full_text)
