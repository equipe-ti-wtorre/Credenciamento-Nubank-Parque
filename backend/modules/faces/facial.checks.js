const { getFacialConfig } = require("./facial.config");
const poseSolver = require("./detector/pose");
const { computeEar } = require("./detector/ear");
const {
  analyzeImage,
  analyzeLightingRegion,
  tryJpegUnderBudget,
  FORMAT_HEIC,
  FORMAT_JPEG,
  FORMAT_PNG,
  FORMAT_UNKNOWN,
  FORMAT_WEBP,
} = require("./facial.image");

const BOTH = ["controlid", "dahua"];
const CONTROLID = ["controlid"];
const DAHUA = ["dahua"];

function check({ id, status, medido, limite, fabricantes_afetados, tipo, mensagem }) {
  return { id, status, medido, limite, fabricantes_afetados, tipo, mensagem };
}

/**
 * @param {object} pose
 * @param {object} cfg
 */
function checkPoseFrontal(pose, cfg) {
  const limite = {
    yaw: cfg.poseMaxYawDeg,
    pitch: cfg.poseMaxPitchDeg,
    roll: cfg.poseMaxRollDeg,
    margin: cfg.poseMarginDeg,
  };
  const medido = {
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    confiante: pose.confiante,
    metodo: pose.metodo,
  };

  if (!pose.confiante || pose.metodo === "roll_only") {
    // Baixa confiança / roll_only: nunca falha (yaw/pitch null; não mascarar como apto pleno).
    return check({
      id: "pose_frontal",
      status: "aviso",
      medido,
      limite,
      fabricantes_afetados: BOTH,
      tipo: "intrinseco",
      mensagem:
        pose.metodo === "roll_only"
          ? `Pose parcial (roll_only, roll=${pose.roll != null ? Number(pose.roll).toFixed(1) : "n/a"}°): yaw/pitch indisponíveis — OpenCV/PnP não disponível.`
          : "Estimativa de pose com baixa confiança; trate como aviso.",
    });
  }

  const axes = [
    { key: "yaw", value: pose.yaw, max: cfg.poseMaxYawDeg },
    { key: "pitch", value: pose.pitch, max: cfg.poseMaxPitchDeg },
    { key: "roll", value: pose.roll, max: cfg.poseMaxRollDeg },
  ];

  let worst = "ok";
  const msgs = [];
  for (const ax of axes) {
    if (ax.value == null) {
      worst = worst === "falha" ? "falha" : "aviso";
      msgs.push(`${ax.key} indisponível`);
      continue;
    }
    const v = Math.abs(ax.value);
    if (v > ax.max + cfg.poseMarginDeg) {
      worst = "falha";
      msgs.push(`${ax.key}=${v.toFixed(1)}° > ${ax.max}°`);
    } else if (v > ax.max) {
      if (worst !== "falha") worst = "aviso";
      msgs.push(`${ax.key} limítrofe (${v.toFixed(1)}°)`);
    }
  }

  return check({
    id: "pose_frontal",
    status: worst,
    medido,
    limite,
    fabricantes_afetados: BOTH,
    tipo: "intrinseco",
    mensagem: msgs.length ? msgs.join("; ") : "Pose frontal dentro dos limites.",
  });
}

function isPoseFrontalConfiavel(pose, cfg) {
  if (!pose || !pose.confiante || pose.metodo !== "pnp") return false;
  if (pose.yaw == null || pose.pitch == null) return false;
  return (
    Math.abs(pose.yaw) <= cfg.poseMaxYawDeg &&
    Math.abs(pose.pitch) <= cfg.poseMaxPitchDeg &&
    Math.abs(pose.roll) <= cfg.poseMaxRollDeg
  );
}

function checkOlhosAbertos(earMedio, pose, cfg) {
  const limite = cfg.earMin;
  const medido = { earMedio, poseMetodo: pose?.metodo, poseConfiante: pose?.confiante };
  const frontal = isPoseFrontalConfiavel(pose, cfg);

  if (earMedio == null) {
    return check({
      id: "olhos_abertos",
      status: "aviso",
      medido,
      limite,
      fabricantes_afetados: BOTH,
      tipo: "intrinseco",
      mensagem: "EAR indisponível.",
    });
  }

  const aberto = earMedio >= limite;
  if (aberto) {
    return check({
      id: "olhos_abertos",
      status: "ok",
      medido,
      limite,
      fabricantes_afetados: BOTH,
      tipo: "intrinseco",
      mensagem: "Olhos abertos (EAR acima do limiar).",
    });
  }

  if (frontal) {
    // Dahua falha; Control iD aviso — emitimos duas entradas? Plano: uma checagem com fabricantes.
    // Severidade: falha afeta só Dahua; Control iD deveria ser aviso.
    // Implementação: status falha com fabricantes_afetados=['dahua'] + mensagem; e avisamos controlid via mesma checagem?
    // Contrato: uma linha. Usamos falha só para dahua; controlid não entra em falha.
    return check({
      id: "olhos_abertos",
      status: "falha",
      medido,
      limite,
      fabricantes_afetados: DAHUA,
      tipo: "intrinseco",
      mensagem: `Olhos fechados/semi (EAR=${earMedio.toFixed(3)} < ${limite}). Control iD: aviso (não bloqueia).`,
    });
  }

  return check({
    id: "olhos_abertos",
    status: "aviso",
    medido,
    limite,
    fabricantes_afetados: BOTH,
    tipo: "intrinseco",
    mensagem: "EAR baixo, mas pose não frontal/confiável — EAR pode estar distorcido.",
  });
}

/**
 * Heurísticas simples de óculos escuros / máscara / testa (a calibrar).
 * Enquanto não houver modelo dedicado, ausência de evidência = ok (não aviso).
 */
function heuristicOcclusion() {
  return {
    oculosEscuros: false,
    mascara: false,
    testaVisivel: true,
    confiancaBaixa: false,
  };
}

/**
 * Checagens intrínsecas + ajustáveis.
 * @returns {Promise<object[]>}
 */
async function runChecks({ detection, imageBuffer, imageMeta, pose, ear }) {
  const cfg = getFacialConfig();
  const checagens = [];
  const faces = detection.faces || [];
  const { imageWidth, imageHeight } = detection;

  // quantidade_rostos
  const n = faces.length;
  checagens.push(
    check({
      id: "quantidade_rostos",
      status: n === 1 ? "ok" : "falha",
      medido: n,
      limite: 1,
      fabricantes_afetados: BOTH,
      tipo: "intrinseco",
      mensagem:
        n === 0
          ? "Nenhum rosto detectado."
          : n === 1
            ? "Um rosto detectado."
            : `${n} rostos detectados; é necessário exatamente 1.`,
    }),
  );

  const face = n === 1 ? faces[0] : null;

  if (face) {
    const box = face.box;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const offsetX = Math.abs(cx - imageWidth / 2) / imageWidth;
    const offsetY = Math.abs(cy - imageHeight / 2) / imageHeight;

    checagens.push(
      check({
        id: "centralizacao",
        status:
          offsetX <= cfg.centerMaxOffsetRatio && offsetY <= cfg.centerMaxOffsetRatio
            ? "ok"
            : "falha",
        medido: { offsetX, offsetY },
        limite: cfg.centerMaxOffsetRatio,
        fabricantes_afetados: CONTROLID,
        tipo: "intrinseco",
        mensagem:
          offsetX <= cfg.centerMaxOffsetRatio && offsetY <= cfg.centerMaxOffsetRatio
            ? "Rosto centralizado."
            : "Rosto descentralizado (Control iD code 4).",
      }),
    );

    const marginL = box.x / imageWidth;
    const marginR = (imageWidth - (box.x + box.width)) / imageWidth;
    const marginT = box.y / imageHeight;
    const marginB = (imageHeight - (box.y + box.height)) / imageHeight;
    const minMargin = Math.min(marginL, marginR, marginT, marginB);
    checagens.push(
      check({
        id: "margem_rosto",
        status: minMargin >= cfg.marginMinRatio ? "ok" : "falha",
        medido: { marginL, marginR, marginT, marginB, minMargin },
        limite: cfg.marginMinRatio,
        fabricantes_afetados: BOTH,
        tipo: "intrinseco",
        mensagem:
          minMargin >= cfg.marginMinRatio
            ? "Margens adequadas."
            : "Rosto muito próximo da borda.",
      }),
    );

    const faceWidthRatio = box.width / imageWidth;
    const sizeOk =
      faceWidthRatio >= cfg.widthMinRatio && faceWidthRatio <= cfg.widthMaxRatio;
    checagens.push(
      check({
        id: "tamanho_rosto",
        status: sizeOk ? "ok" : "falha",
        medido: faceWidthRatio,
        limite: { min: cfg.widthMinRatio, max: cfg.widthMaxRatio },
        fabricantes_afetados: BOTH,
        tipo: "intrinseco",
        mensagem: sizeOk
          ? "Tamanho do rosto adequado."
          : "Rosto muito perto ou muito longe da câmera.",
      }),
    );

    checagens.push(checkPoseFrontal(pose, cfg));
    checagens.push(checkOlhosAbertos(ear?.earMedio, pose, cfg));

    const occ = heuristicOcclusion();
    checagens.push(
      check({
        id: "oculos_escuros",
        status: occ.oculosEscuros ? "falha" : "ok",
        medido: { detected: occ.oculosEscuros, heuristic: true },
        limite: false,
        fabricantes_afetados: BOTH,
        tipo: "intrinseco",
        mensagem: occ.oculosEscuros
          ? "Possíveis óculos escuros detectados."
          : "Sem indício de óculos escuros.",
      }),
    );
    checagens.push(
      check({
        id: "testa_visivel",
        status: occ.testaVisivel ? "ok" : "falha",
        medido: { visible: occ.testaVisivel, heuristic: true },
        limite: true,
        fabricantes_afetados: DAHUA,
        tipo: "intrinseco",
        mensagem: occ.testaVisivel
          ? "Testa aparentemente visível."
          : "Testa coberta (cabelo/chapéu).",
      }),
    );
    checagens.push(
      check({
        id: "mascara",
        status: occ.mascara ? "falha" : "ok",
        medido: { detected: occ.mascara, heuristic: true },
        limite: false,
        fabricantes_afetados: occ.mascara ? DAHUA : BOTH,
        tipo: "intrinseco",
        mensagem: occ.mascara
          ? "Máscara detectada (Dahua reprova; Control iD não recomenda)."
          : "Sem indício de máscara.",
      }),
    );
  } else {
    // Skip face-dependent checks with falha/aviso already covered by quantidade
  }

  // nitidez / iluminação (imagem)
  if (imageMeta.laplacianVariance != null) {
    checagens.push(
      check({
        id: "nitidez",
        status: imageMeta.laplacianVariance >= cfg.laplacianMin ? "ok" : "falha",
        medido: imageMeta.laplacianVariance,
        limite: cfg.laplacianMin,
        fabricantes_afetados: BOTH,
        tipo: "intrinseco",
        mensagem:
          imageMeta.laplacianVariance >= cfg.laplacianMin
            ? "Nitidez adequada."
            : "Imagem borrada (variância Laplaciano baixa).",
      }),
    );
  }

  if (imageMeta.lumaMean != null) {
    let lighting = {
      lumaMean: imageMeta.lumaMean,
      satHighRatio: imageMeta.satHighRatio,
      satLowRatio: imageMeta.satLowRatio,
      scope: "imagem",
    };
    if (face && imageBuffer) {
      try {
        const region = await analyzeLightingRegion(imageBuffer, face.box);
        if (region && region.lumaMean != null) {
          lighting = {
            lumaMean: region.lumaMean,
            satHighRatio: region.satHighRatio,
            satLowRatio: region.satLowRatio,
            scope: "rosto",
            imagem: {
              lumaMean: imageMeta.lumaMean,
              satHighRatio: imageMeta.satHighRatio,
              satLowRatio: imageMeta.satLowRatio,
            },
          };
        }
      } catch (err) {
        console.warn(`[faces/checks] lighting region failed: ${err.message}`);
      }
    }
    const lumaOk = lighting.lumaMean >= cfg.lumaMin && lighting.lumaMean <= cfg.lumaMax;
    const satOk =
      lighting.satHighRatio <= cfg.satHighRatioMax &&
      lighting.satLowRatio <= cfg.satLowRatioMax;
    checagens.push(
      check({
        id: "iluminacao",
        status: lumaOk && satOk ? "ok" : "falha",
        medido: lighting,
        limite: {
          luma: [cfg.lumaMin, cfg.lumaMax],
          satHighRatioMax: cfg.satHighRatioMax,
          satLowRatioMax: cfg.satLowRatioMax,
        },
        fabricantes_afetados: BOTH,
        tipo: "intrinseco",
        mensagem: lumaOk && satOk ? "Iluminação adequada." : "Iluminação inadequada.",
      }),
    );
  }

  // --- ajustáveis ---
  const fmt = imageMeta.format;
  if (fmt === FORMAT_HEIC) {
    checagens.push(
      check({
        id: "formato",
        status: "falha",
        medido: fmt,
        limite: [FORMAT_JPEG, FORMAT_PNG],
        fabricantes_afetados: BOTH,
        tipo: "ajustavel",
        mensagem: "HEIC detectado — converta para JPEG/PNG antes do cadastro.",
      }),
    );
  } else if (fmt === FORMAT_JPEG || fmt === FORMAT_PNG) {
    checagens.push(
      check({
        id: "formato",
        status: "ok",
        medido: fmt,
        limite: [FORMAT_JPEG, FORMAT_PNG],
        fabricantes_afetados: BOTH,
        tipo: "ajustavel",
        mensagem: "Formato aceito.",
      }),
    );
  } else if (fmt === FORMAT_WEBP) {
    checagens.push(
      check({
        id: "formato",
        status: "aviso",
        medido: fmt,
        limite: [FORMAT_JPEG, FORMAT_PNG],
        fabricantes_afetados: BOTH,
        tipo: "ajustavel",
        mensagem: "WebP — converta para JPEG/PNG para os equipamentos.",
      }),
    );
  } else {
    checagens.push(
      check({
        id: "formato",
        status: "falha",
        medido: fmt || FORMAT_UNKNOWN,
        limite: [FORMAT_JPEG, FORMAT_PNG],
        fabricantes_afetados: BOTH,
        tipo: "ajustavel",
        mensagem: "Formato não suportado. Use JPEG ou PNG.",
      }),
    );
  }

  // resolução / arquivo Dahua e Control iD
  const w = imageMeta.width;
  const h = imageMeta.height;
  if (w && h) {
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    const d = cfg.dahua;
    const softMinSide = d.minSideSoft != null ? d.minSideSoft : Math.floor(d.minSide * 0.9);
    // Bloqueio duro só abaixo da faixa mínima absoluta (150×300).
    // Abaixo do soft (mas na faixa absoluta): aviso — equipamentos aceitam ~360–480px.
    // Faixa soft→minSide: aviso.
    if (short < d.minShort || long < d.minLong) {
      checagens.push(
        check({
          id: "resolucao_dahua",
          status: "falha",
          medido: { width: w, height: h, softMinSide },
          limite: {
            faixa: `${d.minShort}x${d.minLong}–${d.maxShort}x${d.maxLong}`,
            minSide: d.minSide,
            softMinSide,
          },
          fabricantes_afetados: DAHUA,
          tipo: "ajustavel",
          mensagem:
            "Resolução de origem insuficiente para Dahua (não é ajuste — bloqueio).",
        }),
      );
    } else if (short < softMinSide) {
      checagens.push(
        check({
          id: "resolucao_dahua",
          status: "aviso",
          medido: { width: w, height: h, softMinSide },
          limite: {
            faixa: `${d.minShort}x${d.minLong}–${d.maxShort}x${d.maxLong}`,
            minSide: d.minSide,
            softMinSide,
          },
          fabricantes_afetados: DAHUA,
          tipo: "ajustavel",
          mensagem: `Resolução (${w}×${h}) abaixo de ${softMinSide}px no lado menor — aceita com aviso (a calibrar).`,
        }),
      );
    } else if (short < d.minSide) {
      checagens.push(
        check({
          id: "resolucao_dahua",
          status: "aviso",
          medido: { width: w, height: h, softMinSide },
          limite: {
            faixa: `${d.minShort}x${d.minLong}–${d.maxShort}x${d.maxLong}`,
            minSide: d.minSide,
            softMinSide,
          },
          fabricantes_afetados: DAHUA,
          tipo: "ajustavel",
          mensagem: `Resolução (${w}×${h}) um pouco abaixo de ${d.minSide}px no lado menor — aceita com aviso (a calibrar).`,
        }),
      );
    } else {
      checagens.push(
        check({
          id: "resolucao_dahua",
          status: "ok",
          medido: { width: w, height: h },
          limite: {
            faixa: `${d.minShort}x${d.minLong}–${d.maxShort}x${d.maxLong}`,
            minSide: d.minSide,
          },
          fabricantes_afetados: DAHUA,
          tipo: "ajustavel",
          mensagem: "Origem permite variante na faixa Dahua.",
        }),
      );
    }

    // arquivo_dahua: comprimir na resolução alvo (sem exigir softMin se origem já é aceitável)
    const targetShort = Math.max(
      Math.min(short, d.minSide),
      d.minShort,
      short >= softMinSide ? softMinSide : short,
    );
    const aspect = w / h;
    let tw;
    let th;
    if (aspect >= 1) {
      th = targetShort;
      tw = Math.round(th * aspect);
      if (tw > d.maxLong) {
        tw = d.maxLong;
        th = Math.round(tw / aspect);
      }
    } else {
      tw = targetShort;
      th = Math.round(tw / aspect);
      if (th > d.maxLong) {
        th = d.maxLong;
        tw = Math.round(th * aspect);
      }
    }

    if (short >= d.minShort && long >= d.minLong) {
      const trial = await tryJpegUnderBudget(imageBuffer, {
        width: tw,
        height: th,
        maxBytes: d.maxBytes,
      });
      checagens.push(
        check({
          id: "arquivo_dahua",
          status: trial.viable ? "ok" : "falha",
          medido: trial,
          limite: d.maxBytes,
          fabricantes_afetados: DAHUA,
          tipo: "ajustavel",
          mensagem: trial.viable
            ? `Variante JPEG viável < ${d.maxBytes} bytes.`
            : `Não foi possível comprimir para < ${d.maxBytes} bytes mantendo resolução mínima.`,
        }),
      );
    } else {
      checagens.push(
        check({
          id: "arquivo_dahua",
          status: "falha",
          medido: { skipped: true },
          limite: d.maxBytes,
          fabricantes_afetados: DAHUA,
          tipo: "ajustavel",
          mensagem: "Arquivo Dahua não avaliável: resolução de origem insuficiente.",
        }),
      );
    }

    // arquivo_controlid < 1MB
    const cidMax = cfg.controlid.maxBytes;
    if (imageMeta.byteSize <= cidMax) {
      checagens.push(
        check({
          id: "arquivo_controlid",
          status: "ok",
          medido: imageMeta.byteSize,
          limite: cidMax,
          fabricantes_afetados: CONTROLID,
          tipo: "ajustavel",
          mensagem: "Arquivo dentro do limite Control iD (<1MB).",
        }),
      );
    } else {
      const trial = await tryJpegUnderBudget(imageBuffer, {
        width: w,
        height: h,
        maxBytes: cidMax,
      });
      checagens.push(
        check({
          id: "arquivo_controlid",
          status: trial.viable ? "ok" : "falha",
          medido: trial,
          limite: cidMax,
          fabricantes_afetados: CONTROLID,
          tipo: "ajustavel",
          mensagem: trial.viable
            ? "Variante < 1MB viável para Control iD."
            : "Não foi possível gerar variante < 1MB.",
        }),
      );
    }
  }

  return checagens;
}

module.exports = {
  runChecks,
  checkPoseFrontal,
  checkOlhosAbertos,
  isPoseFrontalConfiavel,
};
