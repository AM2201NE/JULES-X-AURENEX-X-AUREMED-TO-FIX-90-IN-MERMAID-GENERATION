# Backend & Pipeline Overview

## Ingest (Notion → backend)

- Use Notion API to fetch pages, blocks, and files. For each Notion block that contains media (image / file / pdf / audio / embed) save metadata only initially (title, block_id, file_url, mime_type, size, last_edited_time, caption).
- Do not download every binary immediately. Store metadata and thumbnails only. Fetch full media on-demand or during low-load background sync.

### Sync & rate-limit strategy

- **Incremental sync + webhooks**: maintain a `last_synced` per page; use Notion change webhook (or polling with `modified_since`) to only fetch diffs.
- **Metadata-first approach (preview layer)**: always fetch metadata first (cheap). Only fetch/transfer heavy media when required.
- **Throttled downloads + priority queue**: priority = (recently requested by user) > (frequently-cited) > (background prefetch). Limit concurrent downloads to respect Notion quotas.
- **Local cache + TTL**: cache fetched media permanently (or until storage policy) in your blob store; set TTL for revalidation. Use ETags/last-modified to check updates.
- **CDN + signed URLs**: serve images and media via your CDN/edge storage with short-lived signed URLs so the UI can preview without exposing Notion URLs (and to avoid rate hitting Notion).

## Media storage & serving

Store media in your blob storage (S3 / R2 / GCS) after ingestion. Generate:
- **thumbnails** (JPEG/WEBP small sizes)
- **medium sized versions** for inline chat
- **PDF page thumbnails** (first page and optionally per-page images)
- **streaming-friendly transcoded audio** (e.g., mp3 or ogg) and a low-bitrate preview clip for quick play
- Generate **signed URLs** for UI consumption so chat can display images inline without showing original Notion link.

## Preprocessing

- **Images**: optional OCR (Tesseract / OCR TFLite) for text inside images → store extracted text. Generate alt-text automatically (vision model) to use for context and accessibility.
- **PDFs**: extract text (pdfminer/Apache Tika), generate page images + per-page text chunks. Index text chunks into embeddings. Also create a first-page thumbnail.
- **Audio**: run automatic speech recognition (Whisper or local TFLite) → store transcript + word timestamps. Index transcript chunks into embeddings. Also create a short preview clip (10–15s).
- **Embedded content** (YouTube / embed frames): store embed metadata and thumb, and optionally fetch transcript if allowed.

## Indexing & RAG

- Build embeddings for text sources: page text, OCR text, PDF paragraphs, audio transcripts, alt-text. Use vector DB (FAISS, Milvus, Weaviate, or SQLite+FLANN).
- For media, include a pointer in the embedding entry to `media_id`, `page_id` and a `media_preview_url` (signed). Each embedding record sample:

```json
{
  "id":"embed_123",
  "source_type":"pdf_text|image_ocr|audio_transcript|page_text",
  "page_id":"notion_page_987",
  "block_id":"notion_block_654",
  "media_id":"media_42",    // optional for media chunks
  "text":"extracted/converted snippet",
  "embedding":[...],
  "preview": "https://cdn.example.com/preview/media_42_thumb.jpg"
}
```

## Prompt composition with media-aware citations

When retrieving RAG context, return:
- top-k text chunks (with citation ids)
- top-k media hits (images, pdf pages, audio transcripts) with preview URLs
- The hidden refined prompt should include a context section listing text and media snippets and the media preview URLs (these are signed CDN URLs). Example POML/JSON snippet (see below).

## Chat response & presentation rules

The model receives the refined prompt with context (text chunks, media captions, preview URLs). The model returns:
- **answer_html (or markdown)** containing the textual answer and inline image tags for any media the model decides to show. Example: `![Figure 1](/cdn_signed_url_...)` or for your app UI, `{"type":"image","url":"signed_url","caption":"Figure 1 — MRI of heart"}`. The UI must render the image, not the link.
- **Citation block** (separate structured data accompanying the answer, hidden from the model prompt if desired): a list of sources with fields for printing in the UI footer: `[{id, title, page_id, block_id, media_type, caption, preview_url, citation_text}]`. The UI uses this to render textual citations and media carousels.

### Audit logs & developer transparency

Save `original_prompt`, `refined_prompt`, `context_selection` (ids of text & media chunks used), `model_output`, timestamps. Expose a developer-only debug view to replay and inspect.

### Citation format (structured) — recommended

Return to client both (A) user-facing answer and (B) structured citations array.

Example response payload:
```json
{
  "answer":"The left ventricle pumps oxygenated blood... See the image below.",
  "media_to_render":[
    {
      "cid":"c1",
      "type":"image",
      "caption":"Echocardiogram, Notion page: Cardiology Notes",
      "preview_url":"https://cdn.example.com/signed/media_123_medium.jpg",
      "source": {
        "page_title":"Cardiology Notes",
        "block_id":"notion_block_abc",
        "notion_url":"hidden_or_internal"
      }
    }
  ],
  "citations":[
    {
      "cid":"c1",
      "text_citation":"Cardiology Notes — Block 123. (Notion)",
      "show_link":false
    },
    {
      "cid":"t1",
      "type":"text",
      "text_citation":"WHO Heart Anatomy Overview — Page X. (Notion)",
      "show_link":true,
      "url":"https://notion.link/..."
    }
  ]
}
```

**Rules**:
- `show_link: false` for media (images, audio, pdf preview) so the UI displays them inline using `preview_url` and does not render the raw link.
- For text citations allow `show_link: true` (user can click to open source).

## Media display behavior in chat (UX → behavior spec)

- **Inline images**: small-to-medium thumbnails shown inline inside the chat bubble. Clicking expands to a lightbox full-size image (served by CDN). No raw link text visible.
- **PDFs**: show small inline first-page thumbnail. Provide `Open document` button that opens an embedded PDF viewer (in floating window) rendering streamed pages. In the citation footer show page ranges used.
- **Audio**: show audio player control inline with timestamp and `Show transcript` toggle. If transcript was used for RAG show highlighted snippets.
- **Carousels**: if multiple media pieces are cited, show a small carousel inside the answer that user can swipe/click.
- **Accessibility**: always include alt-text / captions for images. For audio, include the transcript snippet inline or accessible.

## Floating window UX (polished & modern — behaviour & layout)

### Focus: minimal, frictionless, high information density.

### Shell & layout

- **Compact header** with: page title / conversation title / unread indicator / actions (attach media, settings, pin).
- **Body**: vertical chat stream with message grouping (user / AI), media thumbnails inline with messages.
- **Right panel (collapsible)**: Context & Citations — lists the RAG sources used for the current answer, with small thumbnails and quick actions:
  - `Open source in app`, `View raw block`, `Download media`, `Report error`.
- **Floating compose area**: single-line input with:
  - `Attach` button (drag/drop or file picker)
  - `Mic` button to record audio (with immediate upload & transcript)
  - `Quick prompts` / presets button (for the prompt-refiner)

### Interactions

- **Drag & drop upload**: drop media into floating window to instantly upload to your backend; show upload progress and optional fields (title, short note, privacy). After upload, the agent can immediately RAG against it.
- **Inline actions on AI messages**:
  - `Cite sources` (shows full structured citations)
  - `Ask followup` (sends the selected sentence as new user prompt)
  - `Explain this step` (ask model to clarify a paragraph)
- **PDF/Audio viewer**: for PDFs open an embedded viewer with thumbnails, allow the user to select pages to cite; for audio, a waveform + transcript viewer enabling highlight & cite segments.

### Upload & Ask flow

When user uploads media, immediately run preprocessing (OCR/transcribe/extract text) in background. Show `Processing` state. Once done, show `Processed: transcript/preview available`. Allow user to query "Summarize my uploaded file" even before full processing finishes — the system will queue and return partial results.

### Privacy / sharing

Provide controls: `Private` / `Share with workspace` / `Public link` for every uploaded media. When private, do not generate external links — only signed internal CDN links.

## Prompting / Orchestration templates

Below are JSON templates you can plug into your prompt-refiner (POML or JSON prompting). These ensure the model knows to include media in outputs and attach structured citations.

### Refined prompt template (JSON-prompt style) — instructs LLM to use text + media context and to output structured JSON:

```json
{
  "system":"You are an answer engine that uses provided textual and media context. Use media only if it helps illustrate or prove claims. For each media you include, produce a citation entry and output an inline reference.",
  "user_request":"{{original_user_prompt}}",
  "context":{
    "text_chunks": [
      {"id":"t1","text":"...","source":"Page A","score":0.93}
    ],
    "media_chunks":[
      {"id":"m1","type":"image","caption":"MRI heart", "preview_url":"{{signed_url}}", "snippet":"Image caption or OCR text if available"}
    ]
  },
  "instructions":[
    "Answer concisely but completely.",
    "If you include an image, embed it as an inline media object in the structured output and provide a caption.",
    "Return final result as JSON with fields: 'answer_text','media_to_render','citations'."
  ]
}
```

### Expected model output (example) — model must return JSON:
```json
{
  "answer_text":"The left ventricle pumps oxygenated blood... See the echocardiogram below.",
  "media_to_render":[
    {"id":"m1","type":"image","caption":"Echocardiogram showing LV function","preview_url":"https://cdn.example.com/signed/media_123.jpg"}
  ],
  "citations":[
    {"id":"m1","text":"Echocardiogram — Cardiology Notes (Notion)","show_link":false},
    {"id":"t1","text":"Bell et al., Page 3 — Cardiology Notes (Notion)","show_link":true,"url":"https://notion.link/.."}
  ]
}
```

The UI receives this JSON, renders `answer_text`, renders each `media_to_render` inline (using the `preview_url`, not showing link), and shows citations in the footer where `show_link:false` media items do not display raw URLs.

## Practical implementation suggestions (stack-agnostic)

### Workers:
- **Ingest worker** (handles Notion pulls)
- **Processor worker** (thumbnails, OCR, transcript, embedding)
- **RAG worker** (queries vector DB, composes prompt)
- **Model worker** (calls LLM / runs local GGUF model)

### Storage:
- **Blob store** for media (S3/R2/GCS)
- **Vector DB** for embeddings
- **Postgres** for metadata and logs

### APIs:
- `GET /v1/pages/{page_id}` => returns page + available media metadata (thumbs) and a `needs_fetch` flag
- `POST /v1/uploads` => user uploads media (returns `media_id`, preview urls when ready)
- `POST /v1/query` => request, backend chooses strategy, returns `{answer, media_to_render, citations}`

### Security:
- Signed URLs for CDN, short TTL.
- Access controls on uploaded media (ACL per user/workspace).

### Optimization for Notion rate limits:
- Pre-generate thumbnails in larger sync windows.
- Cache actual media; avoid repeated downloads of the same file.
- Respect Notion rate headers and backoff.

### Example developer checklist (quick)

1.  Implement incremental Notion sync + store metadata
2.  Generate thumbnails and thumbnails-only cache first
3.  Build ingestion worker for PDFs & audio (text extraction + indexing)
4.  Add priority queue + concurrency control for media downloads
5.  Store media in blob + generate signed CDN preview URLs
6.  Extend RAG retriever to return media candidates with `preview_url`s
7.  Build prompt templates to instruct LLM to embed media and return structured citations
8.  Implement chat UI adapter to render media inline (thumbnail → lightbox / viewer)
9.  Add upload endpoint + background processing + instant partial results
10. Add developer audit logs for each query (original → refined → context ids → model_out)
11. Add privacy controls for uploaded items

---

# 📄 High-Quality PDF Generation Plan

## 1. AI Output Should Be Structured, Not Raw Text

Always force the AI to output in Markdown or JSON document schema instead of plain text.

Example schema:
```json
{
  "title": "Introduction to Immunology",
  "sections": [
    {
      "heading": "The Immune System",
      "content": "The immune system protects the body from infections.",
      "subsections": [
        {
          "heading": "Innate Immunity",
          "content": "Innate immunity is the first line of defense...",
          "lists": [
            {"type": "bullet", "items": ["Physical barriers", "Phagocytes", "Natural killer cells"]},
            {"type": "numbered", "items": ["Recognition", "Response", "Memory"]}
          ]
        }
      ]
    }
  ]
}
```

OR simpler: AI outputs Markdown like:
```markdown
# Introduction to Immunology

## The Immune System
The immune system protects the body from infections.

### Innate Immunity
Innate immunity is the first line of defense...

- Physical barriers  
- Phagocytes  
- Natural killer cells  

1. Recognition  
2. Response  
3. Memory
```

## 2. Conversion Pipeline

Instead of dumping AI text into a PDF writer, set up a format-preserving conversion:

- **Markdown → PDF**: Use `pandoc` or `pypandoc` with stylesheets. This preserves headings, bold, italic, lists, code blocks, tables.
- **HTML → PDF**: Use `weasyprint` or `wkhtmltopdf` → CSS styling gives full control over margins, fonts, headings, lists.
- **JSON → PDF (templated)**: Use `reportlab.platypus` (Python) with a custom template that enforces:
  - Margins (e.g., 2.5 cm on all sides).
  - Heading styles (H1, H2, bold, italic).
  - Bulleted & numbered lists with indentation.
  - Page breaks between sections if needed.

## 3. PDF Styling Rules

- **Margins**: At least 2.5 cm on all sides → no text overflow.
- **Fonts**: Serif for body, Sans-serif for headings.
- **Heading hierarchy**:
  - H1 → 18–20 pt, bold
  - H2 → 16 pt, bold
  - H3 → 14 pt, italic
- **Bulleted lists**: Proper indentation, • or –.
- **Numbered lists**: Arabic numerals 1., 2., 3. with spacing.
- **Inline formatting**:
  - `**bold**` → bold
  - `*italic*` → italic
- **Tables**: Auto-fit to page width, alternating row shading.
- **Images**: Scaled within page margins, captions below.

## 4. Backend Workflow

1.  User asks for a PDF.
2.  AI generates structured Markdown / JSON instead of raw text.
3.  Backend converts structured output → styled PDF.
4.  Deliver high-quality PDF with proper formatting.

Pseudo-code (Python, Markdown → PDF):
```python
import pypandoc

def generate_pdf(markdown_text, output_path):
    pypandoc.convert_text(
        markdown_text,
        'pdf',
        format='md',
        outputfile=output_path,
        extra_args=['--standalone']
    )
```

## 5. Example

**User request**:
> “Make me a PDF about ECG basics”

**AI (hidden refined prompt)**:
> Generate Markdown with headings, lists, bold/italic, tables where needed.

**AI Output**:
```markdown
# Basics of ECG

## Introduction
The **electrocardiogram (ECG)** records the electrical activity of the heart.

## Key Waves
- **P wave** → Atrial depolarization  
- **QRS complex** → Ventricular depolarization  
- **T wave** → Ventricular repolarization  

## Clinical Importance
1. Detect arrhythmias  
2. Assess cardiac ischemia  
3. Monitor electrolyte imbalance
```

**Final PDF** → Polished PDF with headings, lists, margins, bold text, etc.

✅ With this pipeline, your PDFs will always look professional, readable, and well-formatted — no more messy exports.