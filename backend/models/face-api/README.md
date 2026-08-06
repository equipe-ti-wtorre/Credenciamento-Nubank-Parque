# Modelos face-api (@vladmandic/face-api)

Pesos usados pelo detector (SSD MobileNet v1 + Face Landmark 68).

Origem sugerida:
https://github.com/vladmandic/face-api/tree/master/model

Arquivos esperados neste diretório:
- ssd_mobilenetv1_model-weights_manifest.json
- ssd_mobilenetv1_model.bin
- face_landmark_68_model-weights_manifest.json
- face_landmark_68_model.bin

Download rápido (na pasta backend/):

```bash
mkdir -p models/face-api && cd models/face-api
BASE=https://raw.githubusercontent.com/vladmandic/face-api/master/model
for f in \
  ssd_mobilenetv1_model-weights_manifest.json ssd_mobilenetv1_model.bin \
  face_landmark_68_model-weights_manifest.json face_landmark_68_model.bin
do
  curl -fsSL -o "$f" "$BASE/$f"
done
```

Nota de runtime: neste host `@tensorflow/tfjs-node` pode crashar (Illegal instruction).
O detector usa o build `face-api.node-wasm.js` + backend WASM, convertendo a imagem
para `tf.tensor3d`.

`sharp` pode falhar em CPUs sem microarch x86-64-v2; `facial.image.js` cai para `jimp`.
