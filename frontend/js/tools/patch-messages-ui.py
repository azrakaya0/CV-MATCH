from pathlib import Path

p = Path(__file__).resolve().parents[1] / "modules" / "50-ui-feedback.js"
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
start = next(i for i, l in enumerate(lines) if l.startswith("function renderMessageBubbleHtml"))
end = next(i for i, l in enumerate(lines[start:], start) if l.startswith("function setMessagesThreadOpen"))
new_block = (
    "function renderMessageBubbleHtml(msg, meUsername) {\n"
    "    const mine = msg.sender_username === meUsername;\n"
    "    const showSender =\n"
    "        !mine &&\n"
    '        ((isCompany() && msg.sender_role === "company") ||\n'
    '            (isEmployee() && msg.sender_role === "company"));\n'
    "    const time = formatMessageDateTime(msg.created_at);\n"
    '    return `<div class="msg-row ${mine ? "msg-row--mine" : "msg-row--theirs"}">\n'
    '        <div class="msg-bubble ${mine ? "msg-bubble--mine" : "msg-bubble--theirs"}">\n'
    '            ${showSender ? `<motion class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</div>` : ""}\n'
    '            <div class="msg-body">${escapeHtml(msg.body)}</div>\n'
    '            <div class="msg-time" title="${escapeHtml(time)}">${escapeHtml(time)}</div>\n'
    "        </div>\n"
    "    </div>`;\n"
    "}\n"
    "\n"
    "function renderMessagesThreadHtml(msgs, meUsername) {\n"
    '    if (!msgs?.length) return "";\n'
    '    let html = "";\n'
    '    let lastDay = "";\n'
    "    msgs.forEach((msg) => {\n"
    "        const day = formatMessageDayLabel(msg.created_at);\n"
    "        if (day && day !== lastDay) {\n"
    "            lastDay = day;\n"
    '            html += `<div class="msg-day-sep"><span>${escapeHtml(day)}</span></div>`;\n'
    "        }\n"
    "        html += renderMessageBubbleHtml(msg, meUsername);\n"
    "    });\n"
    "    return html;\n"
    "}\n"
    "\n"
)
new_block = new_block.replace('<motion class="msg-sender">', '<div class="msg-sender">')
lines[start:end] = [new_block]
p.write_text("".join(lines), encoding="utf-8")
print("patched")
