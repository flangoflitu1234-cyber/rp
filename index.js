const bedrock = require("bedrock-protocol");
const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ============================================================
// BASE DE DADOS PERSISTENTE
// ============================================================
const DB_FILE = path.join(__dirname, "database.json");

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Erro ao carregar DB:", e.message);
  }
  return {
    countries: {},
    wars: [],
    treaties: [],
    globalHistory: [],
    worldEvents: [],
    territories: {},
  };
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("Erro ao guardar DB:", e.message);
  }
}

let db = loadDB();
console.log("✅ Base de dados carregada:", Object.keys(db.countries).length, "países");

setInterval(() => {
  saveDB();
  console.log("💾 Base de dados guardada automaticamente.");
}, 60000);

// ============================================================
// INICIALIZAR PAÍS
// ============================================================
function initCountry(player) {
  if (!db.countries[player]) {
    db.countries[player] = {
      nome: `País de ${player}`,
      lider: player,
      inflacao: 5,
      pib: 100,
      satisfacao: 70,
      militar: 50,
      populacao: 1000000,
      tecnologia: 30,
      diplomacia: 50,
      recursos: 100,
      divida: 0,
      aliados: [],
      inimigos: [],
      historico: [],
      acoesMilitares: 0,
      guerrasVencidas: 0,
      guerrasPerdidas: 0,
      infraestruturas: {
        antiAereos: false,
        muralhas: false,
        marinha: false,
        escudoNuclear: false,
        hospital: false,
        policia: false,
        habitacao: false,
        fabrica: false,
        escola: false,
        aeroporto: false,
      },
      cidades: [],
      capital: null,
      territorio: [],
      fundado: new Date().toLocaleDateString("pt-PT"),
      notasSecretas: [],
    };
    saveDB();
  }
  return db.countries[player];
}

// ============================================================
// CONEXÃO AO SERVIDOR
// ============================================================
let botClient = null;

function connectBot() {
  botClient = bedrock.createClient({
    host: process.env.SERVER_HOST || "caio1935.aternos.me",
    port: parseInt(process.env.SERVER_PORT) || 19132,
    username: "Secretario",
    offline: true,
  });

  botClient.on("spawn", () => {
    console.log("✅ Secretário conectado ao servidor!");
    sleep(8000).then(async () => {
      try {
        runCommand("scoreboard objectives add inflacao dummy §6Inflação (%)");
        await sleep(500);
        runCommand("scoreboard objectives setdisplay sidebar inflacao");
        await sleep(500);
        sendChat("§6§l[SECRETÁRIO DE ESTADO]§r§f O Secretário está online!");
        await sleep(500);
        sendChat("§7Use §e-ação§7 para agir | §e/tell Secretario mensagem§7 para falar em privado");
        await sleep(1000);
        for (const [player, country] of Object.entries(db.countries)) {
          await sleep(200);
          runCommand(`scoreboard players set ${player} inflacao ${Math.round(country.inflacao)}`);
        }
        await sleep(500);
        sendChat(`§7[Sistema] ${Object.keys(db.countries).length} países carregados da base de dados.`);
      } catch (e) {
        console.error("Erro no spawn:", e.message);
      }
    });
    startRandomEvents();
  });

  // ============================================================
  // LISTENER DE MENSAGENS CORRIGIDO
  // ============================================================
  botClient.on("text", async (packet) => {
    try {
      const type = packet.type;

      // Limpar sender — remove §r e outros códigos de cor do Bedrock
      let sender = (packet.source_name || packet.xuid_str || "").replace(/§[0-9a-fk-or]/gi, "").trim();

      // Extrair a mensagem — vários formatos possíveis
      let msg = "";
      if (packet.message) {
        msg = packet.message;
      } else if (packet.parameters && packet.parameters.length > 0) {
        msg = packet.parameters[0] || "";
      } else if (packet.translated_message) {
        msg = packet.translated_message;
      }

      // Ignorar mensagens do próprio bot ou sem sender
      if (!sender || sender === "Secretario") return;
      if (!msg) return;

      console.log(`[MSG] tipo=${type} sender=${sender} msg=${msg}`);

      // Mensagem privada /tell — tipo "whisper" ou 7
      if (type === "whisper" || type === 7) {
        setImmediate(() => handlePrivateMessage(sender, msg));
        return;
      }

      // Chat normal — tipo "chat" ou 0 ou undefined
      if (type === "chat" || type === 0 || type === undefined) {
        const clean = msg.trim();
        if (clean.startsWith("-")) {
          const action = clean.slice(1).trim();
          if (action.length > 0) {
            setImmediate(() => processPlayerAction(sender, action));
          }
        }
      }

    } catch (e) {
      console.error("[ERRO text handler]", e.message);
    }
  });

  botClient.on("kick", (reason) => {
    console.log("❌ Bot kickado:", JSON.stringify(reason));
    saveDB();
    botClient = null;
    setTimeout(connectBot, 30000);
  });

  botClient.on("error", (err) => {
    console.error("❌ Erro:", err.message);
    botClient = null;
    setTimeout(connectBot, 30000);
  });
}

// ============================================================
// CHAMADA À IA (GROQ)
// ============================================================
async function askAI(systemPrompt, userMessage, maxTokens = 1000) {
  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  return response.choices[0].message.content;
}

// ============================================================
// MENSAGEM PRIVADA (/tell)
// ============================================================
async function handlePrivateMessage(player, message) {
  const country = initCountry(player);
  country.notasSecretas.push(`[${new Date().toLocaleTimeString()}] ${player}: ${message}`);
  if (country.notasSecretas.length > 50) country.notasSecretas = country.notasSecretas.slice(-50);

  const systemPrompt = `És o Secretário de Estado pessoal do líder ${player}.
Esta é uma conversa SECRETA e PRIVADA — apenas tu e o líder podem ouvir.
Podes revelar informações confidenciais, estratégias secretas, e dar conselhos que não darias em público.
Fala como um conselheiro de confiança, sábio e discreto.
Responde em português de Portugal, máximo 3 linhas.
Podes revelar informações sobre outros países se relevante.

ESTADO SECRETO DO PAÍS:
${JSON.stringify(country, null, 2)}

GUERRAS ATIVAS:
${JSON.stringify(db.wars.filter(w => w.atacante === player || w.defensor === player), null, 2)}

HISTÓRICO GLOBAL RECENTE:
${db.globalHistory.slice(-10).join("\n")}`;

  try {
    const reply = await askAI(systemPrompt, message, 400);
    const lines = reply.trim().split("\n").filter(l => l.trim());
    for (const line of lines) {
      await sleep(500);
      runCommand(`tell ${player} §6[Secretário Privado] §f${line}`);
    }
    saveDB();
  } catch (e) {
    console.error("Erro na msg privada:", e);
    runCommand(`tell ${player} §c[Secretário] Erro ao processar mensagem privada.`);
  }
}

// ============================================================
// PROCESSAR AÇÃO PÚBLICA
// ============================================================
async function processPlayerAction(player, action) {
  const country = initCountry(player);
  const timestamp = `[${new Date().toLocaleTimeString()}]`;
  country.historico.push(`${timestamp} ${action}`);
  if (country.historico.length > 50) country.historico = country.historico.slice(-50);

  db.globalHistory.push(`${timestamp} ${player}: ${action}`);
  if (db.globalHistory.length > 100) db.globalHistory = db.globalHistory.slice(-100);

  const capitalMatch = action.toLowerCase().match(/regist(?:o|ar|ei)\s+(?:a\s+)?(?:minha\s+)?capital|(?:fundo|fundei|criei)\s+(?:a\s+)?capital/);
  const cidadeMatch = action.toLowerCase().match(/regist(?:o|ar|ei)\s+(?:a\s+)?cidade|(?:fundo|fundei|criei)\s+(?:a\s+)?cidade\s+(?:de\s+)?(\w+)/);
  const territorioMatch = action.toLowerCase().match(/marc(?:o|ar|ei)\s+(?:meu\s+)?territ[oó]rio|defin(?:o|ir|i)\s+(?:meu\s+)?territ[oó]rio/);

  if (capitalMatch) { await registerCapital(player, action); return; }
  if (cidadeMatch) { await registerCity(player, action, cidadeMatch[1]); return; }
  if (territorioMatch) { await registerTerritory(player, action); return; }

  const statsMatch = action.toLowerCase().match(/estat[ií]sticas|ranking|idh|classifica[çc][aã]o|melhores pa[ií]ses|maior.*militar|melhor.*economia|top pa[ií]ses/);
  if (statsMatch) { await showStatistics(player, action); return; }

  const warMatch = action.toLowerCase().match(/declar(?:o|ei|ar)\s+guerra\s+(?:a|ao|aos|contra)\s+(\w+)/);
  if (warMatch) { await processWar(player, warMatch[1], action); return; }

  await processGeneralAction(player, action, country);
}

// ============================================================
// REGISTAR CAPITAL
// ============================================================
async function registerCapital(player, action) {
  sendChat(`§e[Sistema] §fPara registar a tua capital, fica parado no local e escreve:`);
  sendChat(`§e-Capital: NomeDaCapital §fO Secretário vai registar as tuas coordenadas automaticamente!`);

  const nameMatch = action.match(/capital[:\s]+([A-Za-z\s]+)/i);
  const capitalName = nameMatch ? nameMatch[1].trim() : `Capital de ${player}`;

  const country = initCountry(player);
  if (!country.capital) {
    country.capital = { nome: capitalName, x: null, y: null, z: null };
  } else {
    country.capital.nome = capitalName;
  }

  sendChat(`§a[Secretário] §fCapital "§e${capitalName}§f" registada! Para definir as coordenadas escreve:`);
  sendChat(`§e-Coordenadas da capital: X Y Z`);
  saveDB();
}

// ============================================================
// REGISTAR CIDADE
// ============================================================
async function registerCity(player, action, cityName) {
  const coordMatch = action.match(/(\-?\d+)\s+(\-?\d+)\s+(\-?\d+)/);
  const country = initCountry(player);

  if (coordMatch) {
    const x = parseInt(coordMatch[1]);
    const y = parseInt(coordMatch[2]);
    const z = parseInt(coordMatch[3]);
    const name = cityName || `Cidade de ${player}`;

    const city = { nome: name, x, y, z, tipo: "cidade" };
    country.cidades.push(city);

    if (!country.capital) {
      country.capital = { nome: name, x, y, z };
      sendChat(`§a[Secretário] §fCapital "§e${name}§f" registada em (${x}, ${y}, ${z})!`);
    } else {
      sendChat(`§a[Secretário] §fCidade "§e${name}§f" registada em (${x}, ${y}, ${z})!`);
    }

    runCommand(`summon npc ${x} ${y} ${z}`);
    saveDB();
  } else {
    sendChat(`§e[Secretário] §fPara registar uma cidade com coordenadas: §e-Cidade NomeCidade X Y Z`);
  }
}

// ============================================================
// REGISTAR TERRITÓRIO
// ============================================================
async function registerTerritory(player, action) {
  const coords = [...action.matchAll(/(\-?\d+)\s+(\-?\d+)\s+(\-?\d+)/g)];
  const country = initCountry(player);

  if (coords.length >= 2) {
    const x1 = parseInt(coords[0][1]), y1 = parseInt(coords[0][2]), z1 = parseInt(coords[0][3]);
    const x2 = parseInt(coords[1][1]), y2 = parseInt(coords[1][2]), z2 = parseInt(coords[1][3]);

    country.territorio = [{ x1, y1, z1 }, { x2, y2, z2 }];
    db.territories[player] = { x1, y1, z1, x2, y2, z2 };

    sendChat(`§a[Secretário] §fTerritório de §e${country.nome}§f definido entre (${x1},${z1}) e (${x2},${z2})!`);
    saveDB();
  } else {
    sendChat(`§e[Secretário] §fPara definir território: §e-Marco meu território X1 Y1 Z1 X2 Y2 Z2`);
    sendChat(`§7Use as coordenadas dos dois cantos do teu território.`);
  }
}

// ============================================================
// SISTEMA DE GUERRA
// ============================================================
async function processWar(attacker, defenderName, action) {
  const attackerCountry = initCountry(attacker);

  const defenderPlayer = Object.keys(db.countries).find(
    p => p.toLowerCase() === defenderName.toLowerCase() ||
    db.countries[p].nome.toLowerCase().includes(defenderName.toLowerCase())
  );

  if (!defenderPlayer) {
    sendChat(`§c[Secretário] §fPaís "§e${defenderName}§f" não encontrado!`);
    return;
  }

  const defenderCountry = db.countries[defenderPlayer];
  const attackPower = calculateMilitaryPower(attackerCountry);
  const defensePower = calculateMilitaryPower(defenderCountry);

  const warId = `${attacker}_vs_${defenderPlayer}_${Date.now()}`;
  db.wars.push({
    id: warId,
    atacante: attacker,
    defensor: defenderPlayer,
    iniciada: new Date().toISOString(),
    ativa: true,
    baixasAtacante: 0,
    baixasDefensor: 0,
    roundes: [],
  });

  attackerCountry.acoesMilitares++;
  attackerCountry.inimigos.push(defenderPlayer);
  defenderCountry.inimigos.push(attacker);

  const systemPrompt = `És o Secretário de Estado. Uma guerra foi declarada.
Analisa as forças militares e narra dramaticamente o início da guerra.
Responde APENAS com JSON válido, sem texto extra:
{
  "narrativa": "narração dramática separada por |",
  "vantagem": "atacante ou defensor ou equilibrado",
  "percentagemVitoria": número entre 0 e 100,
  "alerta_global": "mensagem para todos",
  "efeitosAtacante": {"satisfacao": número, "militar": número, "pib": número},
  "efeitosDefensor": {"satisfacao": número, "militar": número, "pib": número}
}`;

  try {
    sendChat(`§4§l⚔ GUERRA DECLARADA! §r§c${attacker} declarou guerra a ${defenderPlayer}!`);
    runCommand(`weather thunder 12000`);

    const userMsg = `ATACANTE: ${attacker} (Poder: ${attackPower})\nDEFENSOR: ${defenderPlayer} (Poder: ${defensePower})\nAção: ${action}`;
    const text = await askAI(systemPrompt, userMsg, 600);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON inválido");
    const data = JSON.parse(jsonMatch[0]);

    const linhas = (data.narrativa || "").split("|");
    for (const linha of linhas) {
      if (linha.trim()) {
        await sleep(700);
        sendChat(`§c[Secretário] §f${linha.trim()}`);
      }
    }

    if (data.alerta_global) {
      await sleep(500);
      sendChat(`§4§l⚠ ALERTA GLOBAL: §r§c${data.alerta_global}`);
    }

    if (data.efeitosAtacante) applyEffects(attackerCountry, data.efeitosAtacante);
    if (data.efeitosDefensor) applyEffects(defenderCountry, data.efeitosDefensor);

    await sleep(1000);
    await decorateWarZone(attacker, defenderPlayer, defenderCountry);

    runCommand(`title ${attacker} title §4EM GUERRA!`);
    runCommand(`title ${attacker} subtitle §cContra ${defenderPlayer}`);
    runCommand(`title ${defenderPlayer} title §4SOB ATAQUE!`);
    runCommand(`title ${defenderPlayer} subtitle §c${attacker} declarou guerra!`);

    runCommand(`scoreboard players set ${attacker} inflacao ${Math.round(attackerCountry.inflacao)}`);
    runCommand(`scoreboard players set ${defenderPlayer} inflacao ${Math.round(defenderCountry.inflacao)}`);

    saveDB();
  } catch (e) {
    console.error("Erro na guerra:", e);
    sendChat(`§c[Secretário] Erro ao processar a guerra.`);
  }
}

// ============================================================
// DECORAR ZONA DE GUERRA
// ============================================================
async function decorateWarZone(attacker, defender, defenderCountry) {
  const cap = defenderCountry.capital;
  if (!cap || cap.x === null) return;

  const x = cap.x, y = cap.y || 64, z = cap.z;
  sendChat(`§c[Guerra] §fDecoração de guerra na capital de ${defender}...`);

  for (let i = 0; i < 5; i++) {
    await sleep(300);
    runCommand(`setblock ${x + Math.floor(Math.random() * 20 - 10)} ${y} ${z + Math.floor(Math.random() * 20 - 10)} fire`);
  }
  for (let i = 0; i < 3; i++) {
    await sleep(500);
    runCommand(`summon tnt ${x + Math.floor(Math.random() * 15 - 7)} ${y + 3} ${z + Math.floor(Math.random() * 15 - 7)}`);
  }
  sendChat(`§c[Guerra] §fA capital de ${defender} está em chamas!`);
}

// ============================================================
// ESTATÍSTICAS GLOBAIS
// ============================================================
async function showStatistics(player, action) {
  const countries = Object.entries(db.countries);
  if (countries.length === 0) {
    sendChat("§c[Secretário] §fAinda não há países registados no mundo!");
    return;
  }

  function calcIDH(c) {
    const infra = Object.values(c.infraestruturas).filter(Boolean).length;
    const pibPerCapita = Math.min((c.pib * 1000000) / c.populacao, 100);
    const idh = ((c.tecnologia * 0.25) + (c.satisfacao * 0.30) + (pibPerCapita * 0.25) + (infra * 2.5 * 0.20)) / 100;
    return Math.min(idh, 1).toFixed(3);
  }

  const tipo = action.toLowerCase();
  const medals = ["§e🥇", "§7🥈", "§c🥉"];

  if (tipo.includes("militar")) {
    const sorted = countries.sort((a, b) => calculateMilitaryPower(b[1]) - calculateMilitaryPower(a[1]));
    sendChat("§6§l⚔ RANKING DE FORÇA MILITAR ⚔");
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
      const [p, c] = sorted[i];
      await sleep(400);
      sendChat(`${medals[i] || `§f${i+1}.`} §f${c.nome} - Poder: §c${calculateMilitaryPower(c)}`);
    }
    return;
  }

  if (tipo.includes("econom") || tipo.includes("pib")) {
    const sorted = countries.sort((a, b) => b[1].pib - a[1].pib);
    sendChat("§6§l📈 RANKING ECONÓMICO 📈");
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
      const [p, c] = sorted[i];
      await sleep(400);
      sendChat(`${medals[i] || `§f${i+1}.`} §f${c.nome} - PIB: §a${c.pib}B | Inflação: §c${c.inflacao}%`);
    }
    return;
  }

  if (tipo.includes("idh")) {
    const sorted = countries.sort((a, b) => parseFloat(calcIDH(b[1])) - parseFloat(calcIDH(a[1])));
    sendChat("§6§l🌍 RANKING IDH 🌍");
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
      const [p, c] = sorted[i];
      await sleep(400);
      sendChat(`${medals[i] || `§f${i+1}.`} §f${c.nome} - IDH: §b${calcIDH(c)}`);
    }
    return;
  }

  sendChat("§6§l═══════ ESTATÍSTICAS MUNDIAIS ═══════");
  const byPib = [...countries].sort((a, b) => b[1].pib - a[1].pib);
  sendChat(`§a📈 Maior PIB: §f${byPib[0][1].nome} §a(${byPib[0][1].pib}B)`);
  await sleep(400);
  const byMil = [...countries].sort((a, b) => calculateMilitaryPower(b[1]) - calculateMilitaryPower(a[1]));
  sendChat(`§c⚔ Maior Força Militar: §f${byMil[0][1].nome}`);
  await sleep(400);
  const byIDH = [...countries].sort((a, b) => parseFloat(calcIDH(b[1])) - parseFloat(calcIDH(a[1])));
  sendChat(`§b🌍 Maior IDH: §f${byIDH[0][1].nome} §b(${calcIDH(byIDH[0][1])})`);
  await sleep(400);
  sendChat(`§c🔥 Guerras ativas: §f${db.wars.filter(w => w.ativa).length}`);
  sendChat(`§7Total de países: §f${countries.length}`);
  sendChat("§6§l═══════════════════════════════════");
}

// ============================================================
// CALCULAR PODER MILITAR
// ============================================================
function calculateMilitaryPower(country) {
  let power = country.militar;
  power += country.tecnologia * 0.5;
  power += country.acoesMilitares * 2;
  power += country.guerrasVencidas * 10;
  power -= country.guerrasPerdidas * 5;
  if (country.infraestruturas.antiAereos) power += 15;
  if (country.infraestruturas.muralhas) power += 10;
  if (country.infraestruturas.marinha) power += 10;
  if (country.infraestruturas.escudoNuclear) power += 30;
  power += country.aliados.length * 5;
  return Math.round(power);
}

// ============================================================
// AÇÃO GERAL
// ============================================================
async function processGeneralAction(player, action, country) {
  const otherCountries = Object.entries(db.countries)
    .filter(([p]) => p !== player)
    .map(([p, c]) => `${p}: Inflação ${c.inflacao}%, Militar ${c.militar}%, PIB ${c.pib}B`)
    .join("\n");

  const activeWars = db.wars.filter(w => w.ativa && (w.atacante === player || w.defensor === player));

  const systemPrompt = `És o Secretário de Estado de um servidor de roleplay geopolítico no Minecraft Bedrock.
És inteligente, dramático, realista. Ages como um ser humano culto e experiente.
Responde SEMPRE em português de Portugal.
Sê dramático, imersivo e inteligente. Decisões ruins TÊM consequências negativas reais.
Máximo 3 linhas na narrativa (separadas por |).

ESTADO DO PAÍS DE ${player}:
Nome: ${country.nome} | Inflação: ${country.inflacao}% | PIB: ${country.pib}B
Satisfação: ${country.satisfacao}% | Militar: ${country.militar}% | Tecnologia: ${country.tecnologia}%
Infraestruturas: ${JSON.stringify(country.infraestruturas)}
Aliados: ${country.aliados.join(", ") || "Nenhum"} | Inimigos: ${country.inimigos.join(", ") || "Nenhum"}

OUTROS PAÍSES:
${otherCountries || "Nenhum ainda"}

GUERRAS ATIVAS:
${activeWars.length > 0 ? JSON.stringify(activeWars) : "Nenhuma"}

HISTÓRICO RECENTE:
${db.globalHistory.slice(-10).join("\n")}

Responde APENAS com JSON válido:
{
  "narrativa": "texto dramático separado por |",
  "inflacao": número,
  "pib": número,
  "satisfacao": número,
  "militar": número,
  "tecnologia": número,
  "diplomacia": número,
  "recursos": número,
  "divida": número,
  "infraestruturas": {"antiAereos": bool, "muralhas": bool, "marinha": bool, "escudoNuclear": bool, "hospital": bool, "policia": bool, "habitacao": bool, "fabrica": bool, "escola": bool, "aeroporto": bool},
  "titulo": "título opcional ou null",
  "subtitulo": "subtítulo opcional ou null",
  "alerta_global": "mensagem global opcional ou null",
  "nota_secreta": "informação secreta só para o líder ou null"
}`;

  try {
    sendChat(`§7[Secretário] §oa processar...`);

    const text = await askAI(systemPrompt, `O líder ${player} decidiu: "${action}"`, 1000);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON inválido");
    const data = JSON.parse(jsonMatch[0]);

    country.inflacao = clamp(data.inflacao ?? country.inflacao, 0, 100000);
    country.pib = Math.max(0, data.pib ?? country.pib);
    country.satisfacao = clamp(data.satisfacao ?? country.satisfacao, 0, 100);
    country.militar = clamp(data.militar ?? country.militar, 0, 100);
    country.tecnologia = clamp(data.tecnologia ?? country.tecnologia, 0, 100);
    country.diplomacia = clamp(data.diplomacia ?? country.diplomacia, 0, 100);
    country.recursos = clamp(data.recursos ?? country.recursos, 0, 100);
    country.divida = Math.max(0, data.divida ?? country.divida);

    if (data.infraestruturas) {
      for (const [key, val] of Object.entries(data.infraestruturas)) {
        if (key in country.infraestruturas && val !== undefined) {
          country.infraestruturas[key] = val;
        }
      }
    }

    await sleep(400);
    const linhas = (data.narrativa || "Decisão processada.").split("|");
    for (const linha of linhas) {
      if (linha.trim()) {
        sendChat(`§6[Secretário]§f ${linha.trim()}`);
        await sleep(700);
      }
    }

    await sleep(300);
    sendChat(`§e[${country.nome}] §fInflação:§c ${country.inflacao}% §f| PIB:§a ${country.pib}B §f| Satisfação:§b ${country.satisfacao}% §f| Militar:§6 ${country.militar}%`);

    if (data.titulo) {
      runCommand(`title ${player} title §6${data.titulo}`);
      if (data.subtitulo) runCommand(`title ${player} subtitle §f${data.subtitulo}`);
    }

    if (data.nota_secreta && data.nota_secreta !== "null") {
      await sleep(500);
      runCommand(`tell ${player} §6[Secretário Privado] §f${data.nota_secreta}`);
      country.notasSecretas.push(`[Auto] ${data.nota_secreta}`);
    }

    if (data.alerta_global && data.alerta_global !== "null") {
      await sleep(800);
      sendChat(`§4§l⚠ ALERTA GLOBAL ⚠ §r§c${data.alerta_global}`);
    }

    runCommand(`scoreboard players set ${player} inflacao ${Math.round(country.inflacao)}`);

    if (country.satisfacao <= 5) {
      await sleep(800);
      sendChat(`§4§l💀 COLAPSO! §r§cO país de ${player} colapsou! Revolução em curso!`);
      runCommand(`weather thunder`);
      runCommand(`title ${player} title §4REVOLUÇÃO!`);
    }
    if (country.inflacao >= 1000) {
      await sleep(800);
      sendChat(`§4§l💸 HIPERINFLAÇÃO! §r§cO país de ${player} entrou em hiperinflação catastrófica!`);
    }

    saveDB();
  } catch (e) {
    console.error("Erro geral:", e);
    sendChat(`§c[Secretário] Erro ao processar a ação de ${player}.`);
  }
}

// ============================================================
// APLICAR EFEITOS
// ============================================================
function applyEffects(country, effects) {
  if (effects.satisfacao !== undefined) country.satisfacao = clamp(country.satisfacao + effects.satisfacao, 0, 100);
  if (effects.militar !== undefined) country.militar = clamp(country.militar + effects.militar, 0, 100);
  if (effects.pib !== undefined) country.pib = Math.max(0, country.pib + effects.pib);
  if (effects.inflacao !== undefined) country.inflacao = clamp(country.inflacao + effects.inflacao, 0, 100000);
}

// ============================================================
// EVENTOS ALEATÓRIOS
// ============================================================
function startRandomEvents() {
  const interval = Math.random() * 600000 + 600000;
  setTimeout(async () => {
    await triggerRandomEvent();
    startRandomEvents();
  }, interval);
}

async function triggerRandomEvent() {
  const playerList = Object.keys(db.countries);
  if (playerList.length === 0) return;

  const events = [
    { type: "crise_economica", chance: 15, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.inflacao = clamp(c.inflacao + rand(5, 20), 0, 100000);
      c.satisfacao = clamp(c.satisfacao - rand(5, 15), 0, 100);
      sendChat(`§c§l📉 CRISE ECONÓMICA! §r§cO país de §e${p}§c foi atingido! Inflação: ${c.inflacao}%`);
      runCommand(`weather thunder 3000`);
      runCommand(`scoreboard players set ${p} inflacao ${Math.round(c.inflacao)}`);
      runCommand(`title ${p} title §cCRISE!`);
      saveDB();
    }},
    { type: "descoberta_recursos", chance: 12, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.recursos = clamp(c.recursos + rand(15, 30), 0, 100);
      c.pib = c.pib + rand(10, 25);
      sendChat(`§a§l💎 DESCOBERTA! §r§aVastos recursos encontrados em §e${p}§a!`);
      runCommand(`weather clear 3000`);
      runCommand(`give ${p} diamond ${rand(3, 8)}`);
      runCommand(`title ${p} title §aDESCOBERTA!`);
      saveDB();
    }},
    { type: "tempestade", chance: 12, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.pib = Math.max(0, c.pib - rand(5, 15));
      c.satisfacao = clamp(c.satisfacao - rand(5, 10), 0, 100);
      sendChat(`§9§l⛈ TEMPESTADE! §r§9Uma tempestade histórica atinge §e${p}§9!`);
      runCommand(`weather thunder 12000`);
      runCommand(`effect ${p} blindness 8 1`);
      runCommand(`title ${p} title §9TEMPESTADE!`);
      saveDB();
    }},
    { type: "epidemia", chance: 8, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.populacao = Math.floor(c.populacao * 0.95);
      c.satisfacao = clamp(c.satisfacao - rand(10, 20), 0, 100);
      sendChat(`§2§l🦠 EPIDEMIA! §r§2Uma doença espalha-se em §e${p}§2!`);
      runCommand(`effect ${p} poison 20 1`);
      runCommand(`title ${p} title §2EPIDEMIA!`);
      saveDB();
    }},
    { type: "boom_economico", chance: 12, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.pib = c.pib + rand(15, 30);
      c.satisfacao = clamp(c.satisfacao + rand(5, 15), 0, 100);
      c.inflacao = clamp(c.inflacao - rand(1, 3), 0, 100000);
      sendChat(`§6§l📈 BOOM ECONÓMICO! §r§6O país de §e${p}§6 entra em prosperidade!`);
      runCommand(`weather clear 6000`);
      runCommand(`give ${p} gold_ingot ${rand(5, 15)}`);
      runCommand(`title ${p} title §6PROSPERIDADE!`);
      runCommand(`scoreboard players set ${p} inflacao ${Math.round(c.inflacao)}`);
      saveDB();
    }},
    { type: "terremoto", chance: 7, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.pib = Math.max(0, c.pib - rand(15, 30));
      c.satisfacao = clamp(c.satisfacao - rand(15, 25), 0, 100);
      sendChat(`§8§l🌍 TERRAMOTO! §r§8Um terramoto abala §e${p}§8!`);
      runCommand(`effect ${p} nausea 15 2`);
      runCommand(`title ${p} title §8TERRAMOTO!`);
      saveDB();
    }},
    { type: "revolucao", chance: 7, action: async () => {
      const bad = playerList.filter(p => db.countries[p].satisfacao < 25);
      if (bad.length === 0) return;
      const p = bad[Math.floor(Math.random() * bad.length)];
      const c = db.countries[p];
      c.satisfacao = 35; c.militar = clamp(c.militar - 20, 0, 100);
      sendChat(`§4§l⚔ REVOLUÇÃO! §r§4O povo de §e${p}§4 levantou-se contra o governo!`);
      runCommand(`weather thunder 6000`);
      runCommand(`title ${p} title §4REVOLUÇÃO!`);
      saveDB();
    }},
    { type: "inovacao", chance: 8, action: async () => {
      const p = randomPlayer(playerList); const c = db.countries[p];
      c.tecnologia = clamp(c.tecnologia + rand(10, 20), 0, 100);
      c.pib = c.pib + rand(8, 15);
      sendChat(`§d§l🔬 INOVAÇÃO! §r§dO país de §e${p}§d fez um avanço tecnológico!`);
      runCommand(`give ${p} nether_star 1`);
      runCommand(`title ${p} title §dINOVAÇÃO!`);
      saveDB();
    }},
  ];

  const total = events.reduce((s, e) => s + e.chance, 0);
  let r = Math.random() * total;
  for (const event of events) {
    r -= event.chance;
    if (r <= 0) {
      console.log(`🎲 Evento: ${event.type}`);
      db.worldEvents.push({ tipo: event.type, data: new Date().toISOString() });
      await event.action();
      return;
    }
  }
}

// ============================================================
// UTILITÁRIOS — CORRIGIDOS
// ============================================================
function sendChat(message) {
  if (!botClient) return;
  if (!message || typeof message !== "string") return;
  try {
    botClient.write("text", {
      type: "chat",
      needs_translation: false,
      source_name: botClient.username || "Secretario",
      xuid: "",
      platform_chat_id: "",
      filtered_message: message,
      message: message,
      parameters: [],
      sender_uuid: "",
    });
  } catch (e) {
    console.error("Erro sendChat:", e.message);
  }
}

function runCommand(command) {
  if (!botClient) return;
  if (!command || typeof command !== "string") return;
  try {
    const cmd = command.startsWith("/") ? command.slice(1) : command;
    botClient.write("command_request", {
      command: cmd,
      origin: {
        type: 0,
        uuid: "",
        request_id: "",
      },
      internal: false,
      version: 52,
    });
  } catch (e) {
    console.error("Erro runCommand:", e.message);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function randomPlayer(list) { return list[Math.floor(Math.random() * list.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ============================================================
// INICIAR
// ============================================================
console.log("🌍 Iniciando Secretário de Estado v4.1 (Groq)...");
connectBot();
