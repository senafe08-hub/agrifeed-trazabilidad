import re

with open("src/pages/ProduccionPage.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

depth = 0
for i, line in enumerate(lines):
    # This is a naive check but might help spot the issue
    div_opens = len(re.findall(r'<div', line))
    div_closes = len(re.findall(r'</div', line))
    depth += div_opens
    depth -= div_closes
    if div_opens > 0 or div_closes > 0:
        print(f"Line {i+1}: depth={depth} | {line.strip()}")
