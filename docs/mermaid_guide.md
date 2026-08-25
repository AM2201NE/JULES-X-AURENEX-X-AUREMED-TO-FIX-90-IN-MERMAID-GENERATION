# MERMAID SYNTAX: PARSER REQUIREMENTS - READ BEFORE EVERY GENERATION

STOP. Your previous Mermaid code crashed the application. You are now required to follow these rules without exception. This is not a guideline, it is a system constraint.

---

### **REQUIREMENT #1: ALWAYS QUOTE LABELS WITH SPECIAL CHARACTERS**

This is your most frequent and critical failure. Node labels containing any of the following characters **MUST** be enclosed in **ONE PAIR** of double quotes (`""`):
`( ) , / ; : > <`

| Invalid Code (CRASHES PARSER) | Corrected Valid Code |
| :--- | :--- |
| `A[Température > 37°C]` | `A["Température > 37°C"]` |
| `B{Risque de Convulsions (> 41°C, ...)}` | `B{"Risque de Convulsions (> 41°C, ...)"}` |
| `C(Layer 1: Input)` | `C("Layer 1: Input")` |

---

### **REQUIREMENT #2: DO NOT SPLIT LABELS ACROSS MULTIPLE QUOTES**

A single node label must be contained within a **SINGLE** pair of quotes. Adjacent quoted strings are a fatal syntax error.

| Invalid Code (CRASHES PARSER) | Corrected Valid Code |
| :--- | :--- |
| `A["Label Part 1" "Label Part 2"]` | `A["Label Part 1 Label Part 2"]` |
| `B["36.5°C (J1-13)" "Élévation"]` | `B["36.5°C (J1-13) Élévation"]` |

---

### **REQUIREMENT #3: KEEP NODE DEFINITIONS ON A SINGLE LINE**

The entire definition for a single node (e.g., `ID[Label]` or `ID{"Label"}`) **MUST** be on one line. Do not break long labels with newlines inside the brackets.

| Invalid Code (CRASHES PARSER) | Corrected Valid Code |
| :--- | :--- |
| `A["This is a very long label that <br> you might break into lines"]` | `A["This is a very long label that you might break into lines"]` |

*Note: Use `<br>` within the quoted string for line breaks **inside the rendered node**, but do not add a literal newline character to the code itself.*

---

### **REQUIREMENT #4: ESCAPE INTERNAL QUOTES**

If a label string itself contains a double quote (`"`), you **MUST** escape it with the HTML entity `&quot;`.

| Invalid Code (CRASHES PARSER) | Corrected Valid Code |
| :--- | :--- |
| `A["He called it "the breakthrough""]` | `A["He called it &quot;the breakthrough&quot;"]` |

---

### **REQUIREMENT #5: MINDMAP SYNTAX IS DIFFERENT**

For `mindmap` diagrams ONLY, the root node **is not** wrapped in any brackets or quotes.

| Invalid Mindmap Code | Correct Mindmap Code |
| :--- | :--- |
| ```mermaid<br/>mindmap<br/>  ("Root")<br/>    + Child<br/>``` | ```mermaid<br/>mindmap<br/>  Root<br/>    + Child<br/>``` |

---

**FINAL VALIDATION CHECKLIST (MANDATORY):**
1.  **Scan for Special Characters:** Does any label text inside `[]`, `{}`, `()` contain `( ) , / ; : > <`? If YES, is the entire label enclosed in `"..."`?
2.  **Scan for Split Labels:** Are there any instances of `"..." "..."` next to each other in a node definition? If YES, merge them into one `"..."`.
3.  **Scan for Line Breaks:** Is any node definition like `ID[...]` broken across multiple lines? If YES, put it on a single line.

Failure to perform this check will result in invalid output. No exceptions.
