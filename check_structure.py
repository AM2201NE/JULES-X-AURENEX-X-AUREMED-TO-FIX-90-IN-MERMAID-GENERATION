with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Check the biomarker-landscape-scanner object end
idx_bm = content.find(b'biomarker-landscape-scanner')
print('biomarker-landscape-scanner at:', idx_bm)

# Find the closing brace of this object
# Look for the pattern after subcategory
subcat = content.find(b'subcategory', idx_bm)
print('subcategory at:', subcat)

# Find the value end of subcategory
subcat_val_start = content.find(b'"', subcat + 13) + 1
i = subcat_val_start
while i < len(content):
    if content[i] == ord('\\'):
        i += 2
    elif content[i] == ord('"'):
        subcat_val_end = i
        break
    else:
        i += 1
print('subcategory value ends at:', subcat_val_end)

# What's after subcategory value?
print('After subcat value:', repr(content[subcat_val_end:subcat_val_end+100]))