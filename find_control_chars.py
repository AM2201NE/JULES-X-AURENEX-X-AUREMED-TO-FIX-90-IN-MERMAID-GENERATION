with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Check for any control characters in the file
for i, b in enumerate(content):
    if b < 32 and b not in (9, 10, 13):  # Not tab, newline, carriage return
        print(f'Control char at {i}: {b} ({chr(b)}) context: {repr(content[max(0,i-20):i+20])}')