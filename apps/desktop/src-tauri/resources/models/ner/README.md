# Legacy NER Folder

The native ONNX/hybrid NER engine was removed. Lightweight NER now runs through
Gemma/OpenRouter JSON extraction only.

This folder is intentionally kept only because the Windows development layout
still stores `onnxruntime.dll` here for other ONNX consumers (layout detection
and local BGE-M3 embeddings) until the DLL is relocated to a neutral native-lib
folder.

Do not add NER model/tokenizer assets back here.
