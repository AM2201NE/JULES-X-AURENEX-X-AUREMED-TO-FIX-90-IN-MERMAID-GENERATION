import mermaid from "mermaid";
import elkLayoutModule from "@mermaid-js/layout-elk";

let initialized = false;

export function getMermaid() {
    if (!initialized) {
        if (mermaid.registerLayoutLoaders) {
            try {
                const loaders = (elkLayoutModule as any).default ?? elkLayoutModule;
                mermaid.registerLayoutLoaders(Array.isArray(loaders) ? loaders : [loaders]);
            } catch (e) {
                console.warn("[Mermaid Runtime] Could not register ELK layout loader:", e);
            }
        }

        mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: {
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                fontSize: "16px",
                lineColor: "#94a3b8",
                textColor: "#e5e7eb",
                primaryTextColor: "#e5e7eb",
            },
            flowchart: {
                defaultRenderer: "elk",
                curve: "step",
                htmlLabels: true,
                useMaxWidth: true,
            },
            forceLegacyMathML: true,
            suppressErrorRendering: true,
        });

        initialized = true;
    }

    return mermaid;
}
