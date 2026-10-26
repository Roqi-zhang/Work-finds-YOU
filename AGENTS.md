# Architecture rules

- Convert uploaded PDF files to inline multimodal file parts in the shared request helper, never run a local PDF engine in edge workers; PDF parsing can exceed their resource budget.
- Hash complete media content for analysis cache keys; prefix-only hashes can replay an unrelated document's analysis.