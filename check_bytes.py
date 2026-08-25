with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Check around position 10669
print('Bytes 10650-10690:')
for i in range(10650, 10690):
    ch = content[i]
    if 32 <= ch < 127:
        print(f'  {i}: {ch} ({chr(ch)})')
    else:
        print(f'  {i}: {ch} (CTRL)')