// Audio trace probe (VOF-86). tests/integration/audio-trace.mjs injects this before any page script runs.
// It wraps the media element and Web Audio calls the show engine makes, records each call with a timestamp,
// and samples every sounding element, every gain and the true output level on every animation frame.
// It changes nothing audible: the output tap is a unity gain in front of the real destination, and every
// wrapper calls straight through to the browser's own method.
(() => {
  if (window.__vofTrace) return;
  const clock = () => performance.now();
  const round = (value, places) => (Number.isFinite(value) ? Number(value.toFixed(places)) : value);
  const trace = { version: 1, events: [], frames: [], volumeSets: [], nodes: {}, contexts: {} };
  window.__vofTrace = trace;
  const event = (type, data) => { trace.events.push({ t: round(clock(), 2), type, ...data }); };
  const fileOf = (src) => String(src || '').split('?')[0].split('#')[0].split('/').pop();

  let nextId = 1;
  const ids = new WeakMap();
  const idOf = (object, prefix) => {
    let id = ids.get(object);
    if (!id) { id = `${prefix}${nextId++}`; ids.set(object, id); }
    return id;
  };

  // Media elements: every element the page plays or builds through `new Audio()`.
  const elements = [];
  const tracked = new WeakSet();
  const sourceOfElement = new WeakMap();
  const trackElement = (element) => {
    if (!tracked.has(element)) {
      tracked.add(element);
      elements.push(element);
      const id = idOf(element, 'e');
      for (const name of ['playing', 'waiting', 'stalled', 'ended', 'emptied', 'seeked']) {
        element.addEventListener(name, () => event(`media-${name}`, { id, file: fileOf(element.currentSrc || element.src), ct: round(element.currentTime, 3) }));
      }
    }
    return idOf(element, 'e');
  };
  const mediaProto = HTMLMediaElement.prototype;
  const nativePlay = mediaProto.play;
  mediaProto.play = function play(...args) {
    const id = trackElement(this);
    event('play', { id, file: fileOf(this.currentSrc || this.src), volume: round(this.volume, 4), muted: this.muted, ct: round(this.currentTime, 3), readyState: this.readyState, loop: this.loop });
    const result = nativePlay.apply(this, args);
    if (result && typeof result.then === 'function') {
      result.then(
        () => event('play-resolved', { id, file: fileOf(this.currentSrc || this.src), ct: round(this.currentTime, 3) }),
        (error) => event('play-rejected', { id, file: fileOf(this.currentSrc || this.src), error: String((error && error.name) || error) }),
      );
    }
    return result;
  };
  const nativePause = mediaProto.pause;
  mediaProto.pause = function pause(...args) {
    const id = trackElement(this);
    if (!this.paused) event('pause', { id, file: fileOf(this.currentSrc || this.src), ct: round(this.currentTime, 3), volume: round(this.volume, 4) });
    return nativePause.apply(this, args);
  };
  const srcDescriptor = Object.getOwnPropertyDescriptor(mediaProto, 'src');
  Object.defineProperty(mediaProto, 'src', {
    ...srcDescriptor,
    set(value) {
      event('src', { id: trackElement(this), file: fileOf(value) });
      srcDescriptor.set.call(this, value);
    },
  });
  const volumeDescriptor = Object.getOwnPropertyDescriptor(mediaProto, 'volume');
  Object.defineProperty(mediaProto, 'volume', {
    ...volumeDescriptor,
    set(value) {
      trace.volumeSets.push([round(clock(), 2), trackElement(this), round(Number(value), 4)]);
      volumeDescriptor.set.call(this, value);
    },
  });
  const NativeAudio = window.Audio;
  window.Audio = class TracedAudio extends NativeAudio {
    constructor(...args) {
      super(...args);
      event('new-audio', { id: trackElement(this), file: fileOf(args[0]) });
    }
  };

  // Web Audio: contexts, gains, media sources, the graph edges and every AudioParam call.
  const nodeInfo = new WeakMap();
  const nodesById = new Map();
  const edges = new Map();
  const gains = [];
  const contexts = [];
  const paramOwner = new WeakMap();
  const taps = new Map();
  const baseProto = window.BaseAudioContext ? BaseAudioContext.prototype : AudioContext.prototype;
  const nativeCreateGain = baseProto.createGain;
  const nativeCreateAnalyser = baseProto.createAnalyser;
  const nativeConnect = AudioNode.prototype.connect;
  const nativeDisconnect = AudioNode.prototype.disconnect;
  const contextId = (context) => idOf(context, 'c');
  const registerNode = (node, kind, context, extra) => {
    const id = idOf(node, 'n');
    nodeInfo.set(node, { id, kind, context });
    nodesById.set(id, node);
    trace.nodes[id] = { kind, context: contextId(context), t: round(clock(), 2), ...extra };
    return id;
  };
  const nodeIdOf = (node) => nodeInfo.get(node)?.id ?? idOf(node, 'n');
  const addEdge = (from, to) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  };
  const tapFor = (context) => {
    let tap = taps.get(context);
    if (!tap) {
      const gain = nativeCreateGain.call(context);
      const analyser = nativeCreateAnalyser.call(context);
      analyser.fftSize = 2048;
      nativeConnect.call(gain, analyser);
      nativeConnect.call(gain, context.destination);
      tap = { gain, analyser, buffer: new Float32Array(analyser.fftSize) };
      taps.set(context, tap);
    }
    return tap;
  };
  const registerContext = (context) => {
    const id = contextId(context);
    contexts.push(context);
    trace.contexts[id] = { t: round(clock(), 2), sampleRate: context.sampleRate };
    event('context', { id, state: context.state });
    context.addEventListener('statechange', () => event('context-state', { id, state: context.state }));
  };
  const NativeAudioContext = window.AudioContext;
  window.AudioContext = class TracedAudioContext extends NativeAudioContext {
    constructor(...args) {
      super(...args);
      registerContext(this);
    }
  };
  if ('webkitAudioContext' in window) window.webkitAudioContext = window.AudioContext;
  baseProto.createGain = function createGain(...args) {
    const node = nativeCreateGain.apply(this, args);
    registerNode(node, 'gain', this);
    paramOwner.set(node.gain, node);
    gains.push(node);
    return node;
  };
  const nativeCreateSource = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function createMediaElementSource(element) {
    const node = nativeCreateSource.call(this, element);
    const elementId = trackElement(element);
    const id = registerNode(node, 'media-source', this, { element: elementId });
    sourceOfElement.set(element, node);
    event('media-source', { id, element: elementId, file: fileOf(element.currentSrc || element.src) });
    return node;
  };
  AudioNode.prototype.connect = function connect(destination, ...rest) {
    const from = nodeIdOf(this);
    if (destination instanceof AudioDestinationNode) {
      event('connect', { from, to: 'destination' });
      addEdge(from, 'destination');
      nativeConnect.call(this, tapFor(destination.context).gain, ...rest);
      return destination;
    }
    if (destination instanceof AudioParam) {
      event('connect', { from, to: 'param' });
      return nativeConnect.call(this, destination, ...rest);
    }
    const to = nodeIdOf(destination);
    event('connect', { from, to });
    addEdge(from, to);
    return nativeConnect.call(this, destination, ...rest);
  };
  AudioNode.prototype.disconnect = function disconnect(...args) {
    const from = nodeIdOf(this);
    const [target] = args;
    if (args.length === 0 || typeof target === 'number') {
      event('disconnect', { from, to: 'all' });
      edges.delete(from);
      return nativeDisconnect.apply(this, args);
    }
    if (target instanceof AudioDestinationNode) {
      event('disconnect', { from, to: 'destination' });
      edges.get(from)?.delete('destination');
      return nativeDisconnect.call(this, tapFor(target.context).gain, ...args.slice(1));
    }
    const to = target instanceof AudioParam ? 'param' : nodeIdOf(target);
    event('disconnect', { from, to });
    edges.get(from)?.delete(to);
    return nativeDisconnect.apply(this, args);
  };
  const paramProto = AudioParam.prototype;
  for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime']) {
    const native = paramProto[method];
    if (typeof native !== 'function') continue;
    paramProto[method] = function tracedParamCall(...args) {
      const owner = paramOwner.get(this);
      const info = owner && nodeInfo.get(owner);
      event('param', {
        node: info?.id ?? 'untracked',
        method,
        args: args.map((value) => (typeof value === 'number' ? round(value, 5) : 'curve')),
        contextTime: info ? round(info.context.currentTime, 5) : null,
        valueBefore: round(this.value, 5),
      });
      return native.apply(this, args);
    };
  }
  const paramValueDescriptor = Object.getOwnPropertyDescriptor(paramProto, 'value');
  Object.defineProperty(paramProto, 'value', {
    ...paramValueDescriptor,
    set(value) {
      const owner = paramOwner.get(this);
      const info = owner && nodeInfo.get(owner);
      if (info) event('param', { node: info.id, method: 'value=', args: [round(Number(value), 5)], contextTime: round(info.context.currentTime, 5), valueBefore: round(this.value, 5) });
      paramValueDescriptor.set.call(this, value);
    },
  });

  // The gain an element's audio passes through on its way out: 1 for an element playing directly, the product of
  // every gain along each path to the destination for one routed through a media source (0 when it reaches none).
  const pathGain = (element) => {
    const source = sourceOfElement.get(element);
    if (!source) return 1;
    const context = nodeInfo.get(source)?.context;
    if (context && context.state !== 'running') return 0;
    const visit = (id, depth) => {
      if (id === 'destination') return 1;
      if (depth > 12) return 0;
      const node = nodesById.get(id);
      const gain = node && nodeInfo.get(node)?.kind === 'gain' ? node.gain.value : 1;
      let total = 0;
      for (const next of edges.get(id) ?? []) total += visit(next, depth + 1);
      return gain * total;
    };
    return visit(nodeIdOf(source), 0);
  };
  // A bed's own level: its element volume times the first gain after its media source. That is the bed's own
  // envelope on the show graph, which a swap ramps, apart from the shared duck and master stages that a sting or the
  // presenter moves for every bed at once.
  const ownLevel = (element) => {
    const source = sourceOfElement.get(element);
    if (!source) return element.volume;
    for (const next of edges.get(nodeIdOf(source)) ?? []) {
      const node = nodesById.get(next);
      if (node && nodeInfo.get(node)?.kind === 'gain') return element.volume * node.gain.value;
    }
    return element.volume;
  };
  const levelDb = (tap) => {
    tap.analyser.getFloatTimeDomainData(tap.buffer);
    let sum = 0;
    for (const sample of tap.buffer) sum += sample * sample;
    const rms = Math.sqrt(sum / tap.buffer.length);
    return rms > 1e-7 ? round(20 * Math.log10(rms), 1) : -140;
  };
  const uiMarker = () => {
    const screens = [...document.querySelectorAll('[data-screen]')].map((node) => node.getAttribute('data-screen')).join('+');
    const shell = document.querySelector('.question-shell');
    const beat = document.querySelector('[data-stage-beat]');
    return `${screens}|${shell?.getAttribute('data-phase') ?? ''}|${beat?.getAttribute('data-stage-beat') ?? ''}`;
  };

  // The walk-in lyric scroll: which line is lit, and where it sits in the pane (0 top, 1 bottom). The first pane on
  // the page counts, since the lobby and the title both mount one and cross-dissolve.
  const lyricMarker = () => {
    const pane = document.querySelector('[data-role="walkin-lyric"] .vrc-lyric-scroll__viewport');
    if (!pane) return null;
    const lines = [...pane.querySelectorAll('.vrc-lyric-scroll__line')];
    const index = lines.findIndex((node) => node.getAttribute('aria-current') === 'true');
    if (index < 0) return { index: -1, position: null, end: null };
    const box = pane.getBoundingClientRect();
    const line = lines[index].getBoundingClientRect();
    // Whether the pane sits at an end of its scroll range: there the lit line cannot reach the anchor.
    const max = pane.scrollHeight - pane.clientHeight;
    const end = pane.scrollTop <= 1 ? 'top' : pane.scrollTop >= max - 1 ? 'bottom' : 'middle';
    return { index, position: box.height ? round((line.top + line.height / 2 - box.top) / box.height, 3) : null, end };
  };
  const walkinTime = () => {
    for (const element of elements) {
      if (!element.paused && fileOf(element.currentSrc || element.src) === 'walkin.mp3') return round(element.currentTime, 3);
    }
    return null;
  };
  let lastLyric = -2;

  // One sample per animation frame. An element appears while it sounds, plus the frame after it stops, so each
  // stop is visible. Tuple: [id, file, paused, currentTime, volume, muted, loop, readyState, ended, pathGain, own].
  let previouslySounding = new Set();
  let lastUi = '';
  let lastVisibility = document.visibilityState;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const sample = () => {
    const t = round(clock(), 2);
    const sounding = new Set();
    const rows = [];
    for (const element of elements) {
      const playing = !element.paused;
      if (!playing && !previouslySounding.has(element)) continue;
      if (playing) sounding.add(element);
      rows.push([
        idOf(element, 'e'),
        fileOf(element.currentSrc || element.src),
        element.paused ? 1 : 0,
        round(element.currentTime, 3),
        round(element.volume, 4),
        element.muted ? 1 : 0,
        element.loop ? 1 : 0,
        element.readyState,
        element.ended ? 1 : 0,
        round(pathGain(element), 5),
        round(ownLevel(element), 5),
      ]);
    }
    previouslySounding = sounding;
    const frame = { t, e: rows };
    if (gains.length) frame.g = gains.map((node) => [nodeInfo.get(node).id, round(node.gain.value, 5)]);
    if (taps.size) frame.o = [...taps.entries()].map(([context, tap]) => [contextId(context), levelDb(tap), context.state === 'running' ? 1 : 0]);
    const lyric = lyricMarker();
    if (lyric) {
      frame.l = [lyric.index, lyric.position, walkinTime(), lyric.end];
      if (lyric.index !== lastLyric) {
        event('lyric', { index: lyric.index, walkinTime: frame.l[2] });
        lastLyric = lyric.index;
      }
    }
    trace.frames.push(frame);
    const ui = uiMarker();
    if (ui !== lastUi) { event('ui', { ui }); lastUi = ui; }
    if (document.visibilityState !== lastVisibility) {
      lastVisibility = document.visibilityState;
      event('visibility', { state: lastVisibility });
    }
    nativeRaf(sample);
  };
  nativeRaf(sample);
  window.__vofTraceMark = (label) => event('mark', { label });
})();
