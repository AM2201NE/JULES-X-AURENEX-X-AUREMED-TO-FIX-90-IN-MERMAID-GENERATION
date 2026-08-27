function luminance(hex: string): number {
    const value = hex.replace("#", "");

    const rgb = value.length === 3
        ? value.split("").map(x => parseInt(x + x, 16))
        : [
            parseInt(value.slice(0, 2), 16),
            parseInt(value.slice(2, 4), 16),
            parseInt(value.slice(4, 6), 16),
        ];

    const normalized = rgb.map(v => {
        const c = v / 255;
        return c <= 0.03928
            ? c / 12.92
            : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return (
        0.2126 * normalized[0] +
        0.7152 * normalized[1] +
        0.0722 * normalized[2]
    );
}

export function contrastRatio(
    foreground: string,
    background: string
): number {
    const a = luminance(foreground);
    const b = luminance(background);

    const light = Math.max(a, b);
    const dark = Math.min(a, b);

    return (light + 0.05) / (dark + 0.05);
}

export function chooseReadableTextColor(
    background: string,
    preferred: string = "#ffffff"
): string {
    const candidates = [
        preferred,
        "#111827",
        "#ffffff",
        "#000000"
    ];

    let best = candidates[0];
    let bestRatio = 0;

    for (const candidate of candidates) {
        const ratio = contrastRatio(candidate, background);
        if (ratio > bestRatio) {
            best = candidate;
            bestRatio = ratio;
        }
    }

    return best;
}
