import { ProtectedRegion } from './types';

export function protectMath(code: string): { code: string; regions: ProtectedRegion[]; restore: (targetCode: string) => string } {
    const regions: ProtectedRegion[] = [];
    const protectedCode = code.replace(/(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g, (match) => {
        const token = `__AURENEX_MATH_${regions.length}__`;
        regions.push({
            token,
            original: match,
            type: 'math',
        });
        return token;
    });

    return {
        code: protectedCode,
        regions,
        restore(targetCode: string): string {
            let restored = targetCode;
            for (const region of regions) {
                restored = restored.replace(region.token, region.original);
            }
            return restored;
        }
    };
}

export function restoreProtectedRegions(code: string, regions: ProtectedRegion[]): string {
    let restored = code;
    for (const region of regions) {
        restored = restored.replace(region.token, region.original);
    }
    return restored;
}
