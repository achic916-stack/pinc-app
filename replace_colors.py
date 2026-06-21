import os
import re

directories = ['screens', 'components']
extensions = ['.tsx', '.ts']

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Original content hash
    original_content = content

    # Replace backgrounds
    content = re.sub(r'backgroundColor:\s*([\'\"])(?:#FFFFFF|#FFF|white)\1', r'backgroundColor: PincTheme.colors.card', content, flags=re.IGNORECASE)
    content = re.sub(r'backgroundColor:\s*([\'\"])#FDFBF7\1', r'backgroundColor: PincTheme.colors.background', content, flags=re.IGNORECASE)

    # Replace borders
    content = re.sub(r'borderColor:\s*([\'\"])(?:#FFFFFF|#FFF|white)\1', r'borderColor: PincTheme.colors.border', content, flags=re.IGNORECASE)

    # Replace text colors
    content = re.sub(r'color:\s*([\'\"])(?:#000000|#000|black)\1', r'color: PincTheme.colors.textPrimary', content, flags=re.IGNORECASE)
    content = re.sub(r'color:\s*([\'\"])(?:#333|#666)\1', r'color: PincTheme.colors.textSecondary', content, flags=re.IGNORECASE)

    # Status Bar
    content = re.sub(r'barStyle=[\'\"]dark-content[\'\"]', r'barStyle="light-content"', content)

    # Make sure PincTheme is imported if we injected it
    if content != original_content and 'PincTheme.colors' in content and 'PincTheme' not in original_content:
        # Add import at the top
        import_stmt = 'import { PincTheme } from "../styles/theme";\n'
        
        # Insert after the last import statement or at the top
        lines = content.split('\n')
        last_import = -1
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import = i
        if last_import != -1:
            lines.insert(last_import + 1, import_stmt)
            content = '\n'.join(lines)
        else:
            content = import_stmt + content

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {filepath}')

for root_dir in directories:
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if any(filename.endswith(ext) for ext in extensions):
                replace_in_file(os.path.join(dirpath, filename))

# Also update App.tsx
replace_in_file('App.tsx')
print('Done!')
