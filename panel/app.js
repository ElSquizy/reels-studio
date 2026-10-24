// Reels Studio panel UI
const $ = (s) => document.querySelector(s);
const post = (url, data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}) }).then((r) => r.json());
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mmss = (ms) => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
const FUENTES = ["Montserrat", "Poppins", "Inter", "Anton", "Bebas Neue"];
const ESTILOS = { resaltado: "Palabra resaltada en una caja", palabra: "Palabra en color", simple: "Texto simple" };

const aviso = (texto, { error = false, ms = 5000 } = {}) => {
  const el = document.createElement("div");
  el.className = "aviso" + (error ? " error" : "");
  el.textContent = texto;
  $("#avisos").appendChild(el);
  setTimeout(() => el.remove(), ms);
};

// ---------- state ----------
let datos = null;
let ultimo = "";
const refrescar = async () => {
  try {
    const txt = await (await fetch("/api/estado")).text();
    if (txt === ultimo) return;
    const antes = datos;
    ultimo = txt;
    datos = JSON.parse(txt);
    document.documentElement.style.setProperty("--marca", datos.marca.colorMarca);
    avisarFinales(antes);
    pintar();
    if (!antes && !datos.configurado) abrirAjustes(true);
  } catch {}
};
const avisarFinales = (antes) => {
  if (!antes) return;
  for (const t of datos.trabajos) {
    const p = antes.trabajos.find((x) => x.id === t.id);
    if (!p || p.estado === t.estado) continue;
    if (t.tipo === "exportar" && t.estado === "ok") aviso(`"${t.titulo}" está listo en Exportados.`);
    if (t.estado === "error") aviso(`${t.tipo === "exportar" ? "La exportación" : "La transcripción"} de "${t.titulo}" falló: ${t.ultimaLinea ?? ""}`, { error: true, ms: 12000 });
  }
};

// ---------- views ----------
const pintar = () => {
  const exportando = (id) => datos.trabajos.find((t) => t.tipo === "exportar" && t.reel === id && (t.estado === "corriendo" || t.estado === "en cola"));
  $("#grilla").innerHTML = `<div class="nuevo" id="nuevo" tabindex="0" role="button"><div><b>Nuevo reel</b>Soltá un video acá o tocá para elegirlo. Vertical u horizontal: se adapta a 9:16.</div></div>` +
    datos.reels.map((r) => {
      const t = exportando(r.id);
      return `<div><div class="carta" data-reel="${r.id}" tabindex="0" role="button" aria-label="Editar ${esc(r.nombre)}">
        <video src="/${r.video}#t=1" muted preload="metadata" playsinline></video>
        ${t ? `<span class="sello">${t.estado === "en cola" ? "En cola" : `Exportando ${Math.round((t.progreso ?? 0) * 100)}%`}</span>` : r.palabras ? "" : `<span class="sello falta">Sin subtítulos</span>`}
      </div><div class="tapa"><div class="t">${esc(r.nombre)}</div><div class="meta">${r.duracion ? Math.round(r.duracion) + " s, " : ""}${r.palabras} palabras</div></div></div>`;
    }).join("");
  $("#listaExportados").innerHTML = datos.exportados.length
    ? datos.exportados.map((e) => `<div class="fila-video"><div class="grow"><b>${esc(e.archivo)}</b><br><small>${e.mb} MB, ${new Date(e.fecha).toLocaleString()}</small></div><button data-ver="${esc(e.archivo)}">Abrir</button></div>`).join("")
    : `<div class="vacio">Todavía no exportaste ningún reel.</div>`;
};
document.querySelectorAll("[data-vista]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-vista]").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".vista").forEach((v) => v.classList.toggle("on", v.id === "v-" + b.dataset.vista));
}));

// ---------- upload ----------
const subir = async (archivo) => {
  if (!archivo?.type.startsWith("video/")) return aviso("Elegí un archivo de video (MP4, MOV…).", { error: true });
  $("#nuevo").innerHTML = `<div><b>Subiendo…</b>Preparando el video en 9:16</div>`;
  const r = await fetch(`/api/reels/subir?nombre=${encodeURIComponent(archivo.name.replace(/\.[^.]+$/, ""))}`, { method: "POST", body: archivo }).then((x) => x.json());
  ultimo = ""; await refrescar();
  if (r.error) return aviso(r.error, { error: true });
  abrirEditor(r.id, true);
};
const grilla = $("#grilla");
grilla.addEventListener("click", (e) => {
  if (e.target.closest("#nuevo")) return $("#archivoVideo").click();
  const c = e.target.closest("[data-reel]");
  if (c) abrirEditor(c.dataset.reel);
});
grilla.addEventListener("keydown", (e) => { const c = e.target.closest("[data-reel], #nuevo"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); c.click(); } });
grilla.addEventListener("dragover", (e) => { const z = e.target.closest("#nuevo"); if (z) { e.preventDefault(); z.classList.add("arrastrando"); } });
grilla.addEventListener("drop", (e) => { if (e.target.closest("#nuevo")) { e.preventDefault(); subir(e.dataTransfer.files[0]); } });
grilla.addEventListener("mouseover", (e) => { const v = e.target.closest(".carta")?.querySelector("video"); if (v?.paused) v.play().catch(() => {}); });
grilla.addEventListener("mouseout", (e) => { const c = e.target.closest(".carta"); if (c && !c.contains(e.relatedTarget)) { const v = c.querySelector("video"); v.pause(); v.currentTime = 1; } });
$("#archivoVideo").addEventListener("change", (e) => { subir(e.target.files[0]); e.target.value = ""; });
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b?.dataset.abrir) post("/api/abrir", { que: b.dataset.abrir });
  if (b?.dataset.ver) post("/api/abrir", { que: "video", archivo: b.dataset.ver });
});

// ---------- editor ----------
let reel = null, sucio = false, previa = null, activa = -1, esperando = null;
const ed = $("#editor");
const abrirEditor = async (id, transcribirYa = false) => {
  reel = await (await fetch(`/api/reel?id=${encodeURIComponent(id)}`)).json();
  if (reel.error) return aviso(reel.error, { error: true });
  sucio = false; activa = -1;
  $("#edNombre").value = reel.nombre;
  pintarEstilo(); pintarLista(); marcarSucio(false);
  ed.showModal();
  previa = window.montarReel($("#previa"));
  previa.alAvanzar(seguir);
  actualizarPrevia();
  if (transcribirYa) generar(true);
};
const marcarSucio = (v = true) => { sucio = v; $("#edMsg").textContent = v ? "Cambios sin guardar" : ""; };
let tPrevia = null;
const actualizarPrevia = () => { clearTimeout(tPrevia); tPrevia = setTimeout(() => previa?.actualizar({ ...reel, marca: datos.marca }), 150); };
const cambio = () => { marcarSucio(); actualizarPrevia(); };

const pintarLista = () => {
  const subs = reel.subtitulos;
  $("#edEstado").textContent = subs.length ? `${subs.length} palabras. Si escribís dos palabras en una casilla, se separan solas.` : "Este video todavía no tiene subtítulos.";
  $("#edTranscribir").textContent = subs.length ? "Volver a generar" : "Generar subtítulos";
  $("#edLista").innerHTML = subs.length
    ? subs.map((s, i) => `<div class="ed-fila ${i === activa ? "activa" : ""}" data-i="${i}">
        <button class="tiempo" data-ir="${i}" title="Ir a este momento">${mmss(s.startMs)}</button>
        <input value="${esc(s.text.trim())}" data-texto="${i}" aria-label="Palabra ${i + 1}" />
        <span class="acc"><button class="chico" data-unir="${i}" ${i === subs.length - 1 ? "disabled" : ""} title="Unir con la siguiente">Unir</button><button class="chico" data-borrar="${i}">Borrar</button></span>
      </div>`).join("")
    : `<div class="vacio">Tocá "Generar subtítulos" y en unos segundos aparecen acá, palabra por palabra.</div>`;
};
const seguir = (seg) => {
  const ms = seg * 1000;
  const i = reel?.subtitulos.findIndex((s) => ms >= s.startMs && ms < s.endMs) ?? -1;
  if (i === activa) return;
  document.querySelector(`.ed-fila[data-i="${activa}"]`)?.classList.remove("activa");
  activa = i;
  const fila = document.querySelector(`.ed-fila[data-i="${i}"]`);
  if (fila) { fila.classList.add("activa"); if (!document.activeElement?.closest(".ed-fila")) fila.scrollIntoView({ block: "nearest" }); }
};
const pintarEstilo = () => {
  $("#edEstilo").innerHTML = `<h4>Estilo</h4>
    <label class="campo">Cómo se marca la palabra que se dice<select data-op="estilo">${Object.entries(ESTILOS).map(([k, n]) => `<option value="${k}" ${reel.estilo === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label class="campo">Tamaño de letra<span class="par"><input type="range" min="44" max="110" step="1" data-op="tamano" value="${reel.tamano}" /><span>${reel.tamano} px</span></span></label>
    <label class="campo">Altura de los subtítulos<span class="par"><input type="range" min="400" max="1550" step="10" data-op="posicionY" value="${reel.posicionY}" /><span>${reel.posicionY} px</span></span></label>
    <label class="check"><input type="checkbox" data-op="mayusculas" ${reel.mayusculas ? "checked" : ""} /> Todo en mayúsculas</label>
    <label class="check"><input type="checkbox" data-op="mostrarLogo" ${reel.mostrarLogo ? "checked" : ""} /> Logo arriba</label>
    <label class="check"><input type="checkbox" data-op="cierre" ${reel.cierre ? "checked" : ""} /> Cierre con logo y web</label>
    <p class="msg">Los colores, el logo y la fuente se cambian en Configuración.</p>`;
};
const fijarTexto = (i, valor) => {
  const s = reel.subtitulos[i];
  const partes = valor.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return;
  const esp = i > 0 ? " " : "";
  if (partes.length === 1) { s.text = esp + partes[0]; return; }
  const paso = (s.endMs - s.startMs) / partes.length;
  reel.subtitulos.splice(i, 1, ...partes.map((p, k) => ({ ...s, text: (k === 0 ? esp : " ") + p, startMs: Math.round(s.startMs + k * paso), endMs: Math.round(s.startMs + (k + 1) * paso), timestampMs: Math.round(s.startMs + (k + 0.5) * paso) })));
  pintarLista();
};
const guardar = async () => {
  reel.nombre = $("#edNombre").value.trim() || reel.nombre;
  const { id, nombre, subtitulos, estilo, tamano, posicionY, mayusculas, mostrarLogo, cierre, segundosCierre } = reel;
  const r = await post("/api/reels/guardar", { id, cambios: { nombre, subtitulos, estilo, tamano, posicionY, mayusculas, mostrarLogo, cierre, segundosCierre } });
  if (r.error) { aviso(r.error, { error: true }); return false; }
  marcarSucio(false); $("#edMsg").textContent = "Guardado"; ultimo = ""; refrescar();
  return true;
};
const generar = async (automatico = false) => {
  if (!automatico && reel.subtitulos.length && !confirm("Se reemplazan los subtítulos actuales y tus correcciones. ¿Seguís?")) return;
  if (sucio && !(await guardar())) return;
  const r = await post("/api/reels/transcribir", { id: reel.id });
  if (r.error) return aviso(r.error, { error: true, ms: 9000 });
  const boton = $("#edTranscribir");
  boton.disabled = true;
  $("#edEstado").textContent = datos.ajustes.modo === "openai" ? "Generando subtítulos con OpenAI…" : "Generando subtítulos en tu PC… La primera vez descarga el modelo y tarda un poco más.";
  const idTrabajo = r.id, idReel = reel.id;
  clearInterval(esperando);
  esperando = setInterval(async () => {
    const t = datos?.trabajos.find((x) => x.id === idTrabajo);
    if (!t || t.estado === "corriendo") return;
    clearInterval(esperando);
    boton.disabled = false;
    if (reel?.id !== idReel) return;
    if (t.estado === "error") return pintarLista();
    const nuevo = await (await fetch(`/api/reel?id=${encodeURIComponent(idReel)}`)).json();
    reel.subtitulos = nuevo.subtitulos; marcarSucio(false);
    pintarLista(); actualizarPrevia();
    aviso(`Subtítulos listos: ${nuevo.subtitulos.length} palabras. Revisalos y corregí lo que haga falta.`);
  }, 1000);
};
ed.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.op) {
    reel[t.dataset.op] = t.type === "checkbox" ? t.checked : t.type === "range" ? Number(t.value) : t.value;
    if (t.type === "range") t.nextElementSibling.textContent = `${t.value} px`;
    cambio();
  }
  if (t.dataset.texto) { const i = Number(t.dataset.texto); reel.subtitulos[i].text = (i > 0 ? " " : "") + t.value.trim(); cambio(); }
});
ed.addEventListener("change", (e) => { if (e.target.dataset.texto) { fijarTexto(Number(e.target.dataset.texto), e.target.value); cambio(); } });
ed.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.ir) previa?.irA(reel.subtitulos[Number(b.dataset.ir)].startMs / 1000);
  if (b.dataset.unir) { const i = Number(b.dataset.unir), a = reel.subtitulos[i], s = reel.subtitulos[i + 1]; reel.subtitulos.splice(i, 2, { ...a, text: a.text + s.text, endMs: s.endMs }); pintarLista(); cambio(); }
  if (b.dataset.borrar) { reel.subtitulos.splice(Number(b.dataset.borrar), 1); pintarLista(); cambio(); }
  if (b.id === "edTranscribir") generar();
  if (b.id === "edGuardar" && (await guardar())) aviso("Reel guardado");
  if (b.id === "edExportar") {
    if (!(await guardar())) return;
    const r = await post("/api/reels/exportar", { id: reel.id });
    if (r.error) return aviso(r.error, { error: true });
    aviso("Exportación en marcha. Va a aparecer en Exportados.");
  }
  if (b.id === "edEliminar" && confirm(`¿Eliminar "${reel.nombre}"? Se mueve a public/reels/.trash.`)) { await post("/api/reels/eliminar", { id: reel.id }); sucio = false; ed.close(); ultimo = ""; refrescar(); }
  if (b.id === "edCerrar") ed.requestClose ? ed.requestClose() : ed.close();
});
ed.addEventListener("cancel", (e) => { if (sucio && !confirm("Hay cambios sin guardar. ¿Cerrás igual?")) e.preventDefault(); });
ed.addEventListener("close", () => { clearInterval(esperando); previa?.desmontar(); previa = null; reel = null; });

// ---------- settings (brand + transcription) ----------
const aj = $("#ajustes");
let borrador = null;
const abrirAjustes = (bienvenida = false) => {
  borrador = { ...datos.marca };
  $("#ajBienvenida").hidden = !bienvenida;
  $("#ajTitulo").textContent = bienvenida ? "Configurá tu marca" : "Configuración";
  $("#ajCancelar").hidden = bienvenida;
  $("#ajNombre").value = borrador.nombre; $("#ajWeb").value = borrador.web;
  $("#ajColorMarca").value = borrador.colorMarca; $("#ajColorSecundario").value = borrador.colorSecundario; $("#ajColorTexto").value = borrador.colorTexto;
  $("#ajFuente").innerHTML = FUENTES.map((f) => `<option ${borrador.fuente === f ? "selected" : ""}>${f}</option>`).join("") + (borrador.fuenteArchivo ? `<option value="archivo" ${borrador.fuente === "archivo" ? "selected" : ""}>Mi fuente (subida)</option>` : "");
  $("#ajIdioma").value = datos.ajustes.idioma;
  (datos.ajustes.modo === "openai" ? $("#ajOpenai") : $("#ajLocal")).checked = true;
  $("#ajClave").value = "";
  $("#ajClave").placeholder = datos.ajustes.tieneClave ? "Ya hay una clave guardada (dejalo vacío para mantenerla)" : "sk-…";
  pintarLogo(); modoClave();
  aj.showModal();
};
const pintarLogo = () => {
  const m = $("#ajLogoMuestra");
  m.style.backgroundImage = borrador.logo ? `url('/${borrador.logo}')` : "";
  m.textContent = borrador.logo ? "" : ($("#ajNombre").value || "Tu marca");
};
const modoClave = () => { $("#ajClaveCampo").hidden = !$("#ajOpenai").checked; };
aj.addEventListener("change", (e) => { if (e.target.name === "modo") modoClave(); });
$("#ajNombre").addEventListener("input", pintarLogo);
const subirArchivoMarca = (input, tipo) => new Promise((ok) => {
  input.onchange = async () => {
    const f = input.files[0]; input.value = "";
    if (!f) return ok(null);
    const r = await fetch(`/api/marca/archivo?tipo=${tipo}&ext=${f.name.split(".").pop()}`, { method: "POST", body: f }).then((x) => x.json());
    if (r.error) { aviso(r.error, { error: true }); return ok(null); }
    ok(r.archivo);
  };
  input.click();
});
aj.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "ajSubirLogo") { const a = await subirArchivoMarca($("#archivoLogo"), "logo"); if (a) { borrador.logo = a; pintarLogo(); } }
  if (b.id === "ajQuitarLogo") { borrador.logo = ""; pintarLogo(); }
  if (b.id === "ajSubirFuente") {
    const a = await subirArchivoMarca($("#archivoFuente"), "fuente");
    if (a) { borrador.fuenteArchivo = a; borrador.fuente = "archivo"; $("#ajFuente").insertAdjacentHTML("beforeend", `<option value="archivo" selected>Mi fuente (subida)</option>`); }
  }
  if (b.id === "ajCancelar") aj.close();
  if (b.id === "ajGuardar") {
    const modo = $("#ajOpenai").checked ? "openai" : "local";
    if (modo === "openai" && !datos.ajustes.tieneClave && !$("#ajClave").value.trim()) return aviso("Pegá tu clave de OpenAI o elegí la transcripción en esta PC.", { error: true });
    const marca = { ...borrador, nombre: $("#ajNombre").value.trim() || "Mi Marca", web: $("#ajWeb").value.trim(), colorMarca: $("#ajColorMarca").value, colorSecundario: $("#ajColorSecundario").value, colorTexto: $("#ajColorTexto").value, fuente: $("#ajFuente").value };
    const r = await post("/api/ajustes", { marca, ajustes: { modo, idioma: $("#ajIdioma").value, openaiKey: $("#ajClave").value } });
    if (r.error) return aviso(r.error, { error: true });
    aj.close(); ultimo = ""; await refrescar();
    aviso("Configuración guardada");
  }
});
aj.addEventListener("cancel", (e) => { if (!datos.configurado) e.preventDefault(); });
$("#btnAjustes").addEventListener("click", () => abrirAjustes(false));

refrescar();
setInterval(refrescar, 1500);
