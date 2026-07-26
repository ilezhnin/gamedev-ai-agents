// Screen flow: title -> setup -> briefing -> play -> end, plus the pause menu
// and the settings pane. Owns which screen is up, whether the sim is halted,
// and the DOM wiring for every button on those screens. The match itself is
// built by the composition root and handed in through `deps`.

import { drawTitleLogo } from './sprites.js';
import { saveSettings } from './settings.js';
import { byId, onClick, onInput, setToggle } from './dom.js';
import {
  briefingText, drawSetupPreview, rerollSeed, syncSetupWidgets, wireSetupScreen,
} from './setup.js';

const BRIEF_CHARS_PER_TICK = 2;   // typewriter speed for the briefing text
const BRIEF_TICK_MS = 16;
const TITLE_FRAME_MS = 100;       // title sky redraws at ~10fps
const END_SCREEN_DELAY = 1800;    // ms between the last shot and the verdict

export class Screens {
  // deps: getGame/getUI/getInput (live, may be undefined before the first
  // match), buildMatch, loadSavedGame, hasValidSave, autosave, clearSave,
  // resize, setSpeed
  constructor(audio, settings, deps) {
    this.audio = audio;
    this.settings = settings;
    this.deps = deps;

    this.state = 'title';            // title | setup | brief | play | end
    this.paused = false;
    this.endShown = false;
    this.menuOpen = false;
    this.menuContext = 'pause';      // 'pause' (in-game) | 'title' (settings only)
    this.titleRaf = 0;
    this.titleT0 = 0;
    this.titleLastDraw = 0;
    this.audioArmed = false;

    this.elTitle = byId('screen-title');
    this.elSetup = byId('screen-setup');
    this.elBrief = byId('screen-brief');
    this.elEnd = byId('screen-end');
    this.elPaused = byId('paused');
    this.elLoading = byId('loading');
    this.elMenu = byId('menu');
    this.elMenuMain = byId('menu-main');
    this.elMenuSettings = byId('menu-settings');
  }

  // the sim only advances when no screen is sitting on top of it
  get halted() { return this.paused || this.menuOpen; }

  // ----------------------------------------------------------- title anim --

  // The title logo canvas doubles as a slow animated sky: drifting cloud bands
  // with the occasional lightning flicker, redrawn ~10fps only while visible.
  startTitleAnim() {
    if (this.titleRaf) return;
    const el = byId('title-logo');
    this.titleT0 = performance.now();
    this.titleLastDraw = 0;
    const step = (now) => {
      if (this.state !== 'title') { this.titleRaf = 0; return; }
      if (now - this.titleLastDraw >= TITLE_FRAME_MS) {
        this.titleLastDraw = now;
        drawTitleLogo(el, (now - this.titleT0) / 1000);
      }
      this.titleRaf = requestAnimationFrame(step);
    };
    this.titleRaf = requestAnimationFrame(step);
  }

  // -------------------------------------------------------------- screens --

  hideScreens() {
    for (const el of [this.elTitle, this.elSetup, this.elBrief, this.elEnd]) el.classList.add('hidden');
  }

  // the command sidebar exists only inside a running match
  setSidebar(visible) {
    byId('sidebar').classList.toggle('hidden', !visible);
    this.deps.resize(); // viewport width changed — rescale the render buffer
  }

  showTitle() {
    const game = this.deps.getGame();
    this.hideScreens();
    this.state = 'title';
    this.setSidebar(false);
    const canContinue = !!(game && !game.over && !this.endShown) || this.deps.hasValidSave();
    byId('tb-continue').classList.toggle('disabled', !canContinue);
    this.elTitle.classList.remove('hidden');
    this.startTitleAnim();
    // resume the ominous menu march (only once audio has been unlocked by a
    // gesture; the first-gesture handler covers the very first title paint)
    if (this.audio.musicOn && this.audio.ctx) this.audio.playMenu();
  }

  showSetup() {
    this.hideScreens();
    this.state = 'setup';
    rerollSeed();                    // fresh battlefield each visit
    syncSetupWidgets();
    drawSetupPreview();
    this.elSetup.classList.remove('hidden');
    this.audio.ensure(); this.audio.resume();
    if (this.audio.musicOn) this.audio.playMenu(); // menu theme carries through setup
    this.audio.sfx('select');
  }

  showBrief() {
    this.hideScreens();
    this.state = 'brief';
    this.elBrief.classList.remove('hidden');
    this.typeBriefing();
    this.audio.sfx('ready');
  }

  typeBriefing() {
    const el = byId('briefing-text');
    const text = briefingText();
    el.textContent = '';
    let i = 0;
    const tick = () => {
      if (this.state !== 'brief') return;
      i += BRIEF_CHARS_PER_TICK;
      el.textContent = text.slice(0, i);
      if (i < text.length) setTimeout(tick, BRIEF_TICK_MS);
    };
    tick();
  }

  // a match is live and on screen
  enterPlay() {
    this.state = 'play';
    this.endShown = false;
  }

  // synchronous match build — used by both the normal flow and the test hooks
  buildAndStart() {
    this.deps.buildMatch();
    this.enterPlay();
  }

  // Start (or arm) the in-match battle theme. Sets the song context even when
  // music is muted, so re-enabling it mid-battle resumes the right track.
  playBattleTheme() {
    this.audio.currentSong = 'battle';
    this.audio.currentLoop = true;
    if (this.audio.musicOn) this.audio.startMusic();
  }

  startMatch() {
    this.hideScreens();
    this.setSidebar(true);
    // brief loading flash — generating a 96×96 map can take a beat. Show the
    // overlay, let it paint one frame, then do the synchronous build.
    this.elLoading.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.buildAndStart();
      this.elLoading.classList.remove('on');
      this.playBattleTheme();
      this.audio.say('Battle control online', true);
    }));
  }

  continueMatch() {
    const game = this.deps.getGame();
    // prefer the warm in-memory match; otherwise reload the last save from disk
    if (game && !game.over && !this.endShown) {
      this.hideScreens();
      this.state = 'play';
      this.setSidebar(true);
      this.playBattleTheme();
      return;
    }
    if (!this.deps.hasValidSave()) return;
    this.hideScreens();
    this.setSidebar(true);
    this.elLoading.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ok = this.deps.loadSavedGame();
      this.elLoading.classList.remove('on');
      if (!ok) { this.showTitle(); return; }
      this.playBattleTheme();
      this.audio.say('Battle control online', true);
    }));
  }

  advanceScreen() {
    this.audio.ensure(); this.audio.resume();
    if (this.state === 'title') this.showSetup();
    else if (this.state === 'setup') { this.audio.sfx('ack'); this.showBrief(); }
    else if (this.state === 'brief') this.startMatch();
    else if (this.state === 'end') this.showTitle();
  }

  // the match is decided: freeze the save, then roll the end screen
  checkMatchEnd() {
    const game = this.deps.getGame();
    if (!game.over || this.endShown) return;
    this.endShown = true;
    this.deps.clearSave();   // match decided — nothing left to continue
    setTimeout(() => {
      this.closeMenu();
      this.state = 'end';
      this.setSidebar(false);
      this.deps.getUI().showEnd(game.won, game.players.player.stats);
      // end-screen stinger: victory fanfare or defeat dirge, then silence
      if (this.audio.musicOn) this.audio.playJingle(game.won);
      else { this.audio.stopMusic(); this.audio.sfx(game.won ? 'ready' : 'zapdown'); }
    }, END_SCREEN_DELAY);
  }

  // ----------------------------------------------------------- pause menu --

  showMenuPane(pane) {
    this.elMenuMain.style.display = pane === 'main' ? 'flex' : 'none';
    this.elMenuSettings.style.display = pane === 'settings' ? 'flex' : 'none';
    byId('menu-box').querySelector('.menu-title').textContent =
      this.menuContext === 'title' ? 'SETTINGS' : 'OPERATION PAUSED';
  }

  openMenu(context = 'pause') {
    const input = this.deps.getInput();
    this.menuOpen = true;
    this.menuContext = context;
    if (input) input.blocked = true;
    if (context === 'title') { this.syncSettingsWidgets(); this.showMenuPane('settings'); }
    else this.showMenuPane('main');
    this.elMenu.classList.add('open');
    this.audio.sfx('select');
  }

  closeMenu() {
    const input = this.deps.getInput();
    this.menuOpen = false;
    if (input) input.blocked = false;
    this.elMenu.classList.remove('open');
    // RESUME must also lift a P-key pause, else the sim stays frozen
    this.paused = false;
    this.elPaused.style.display = 'none';
  }

  quitToTitle() {
    this.deps.autosave();  // persist so CONTINUE survives even a later reload
    this.closeMenu();
    this.paused = false;
    this.elPaused.style.display = 'none';
    this.audio.stopMusic();
    this.audio.musicOn = true; // arm music for the next match
    this.showTitle();          // the running match stays warm for CONTINUE
  }

  syncSettingsWidgets() {
    const settings = this.settings;
    byId('set-master').value = settings.master;
    byId('set-music').value = settings.musicVol;
    byId('set-sfx').value = settings.sfxVol;
    byId('set-camspeed').value = settings.camSpeed;
    byId('set-gamespeed').value = settings.gameSpeed;
    byId('set-gamespeed-val').textContent = `${settings.gameSpeed.toFixed(1)}×`;
    setToggle('set-musicon', this.audio.musicOn);
    setToggle('set-voice', settings.voice);
    setToggle('set-edge', settings.edgeScroll);
  }

  // ---------------------------------------------------------------- wiring --

  wire() {
    const audio = this.audio, settings = this.settings;

    wireSetupScreen(audio, {
      onStart: () => this.showBrief(),
      onBack: () => this.showTitle(),
    });

    onClick('tb-new', () => this.showSetup());
    onClick('tb-continue', () => {
      audio.ensure(); audio.resume();
      this.continueMatch();
    });
    onClick('tb-settings', () => {
      audio.ensure(); audio.resume();
      this.openMenu('title');
    });

    onClick('mb-resume', () => this.closeMenu());
    onClick('mb-quit', () => this.quitToTitle());
    onClick('mb-settings', () => {
      this.syncSettingsWidgets();
      this.showMenuPane('settings');
    });
    onClick('mb-back', () => {
      if (this.menuContext === 'title') this.closeMenu();
      else this.showMenuPane('main');
    });
    // clicking the dark backdrop resumes; clicks inside the box stay put
    this.elMenu.addEventListener('click', (e) => { if (e.target === this.elMenu) this.closeMenu(); });

    onInput('set-master', (e) => {
      settings.master = parseFloat(e.target.value);
      audio.ensure(); audio.setMaster(settings.master);
      audio.sfx('tick');
      saveSettings(settings);
    });
    onInput('set-music', (e) => {
      settings.musicVol = parseFloat(e.target.value);
      audio.ensure(); audio.setMusicVol(settings.musicVol);
      saveSettings(settings);
    });
    onInput('set-sfx', (e) => {
      settings.sfxVol = parseFloat(e.target.value);
      audio.ensure(); audio.setSfxVol(settings.sfxVol);
      audio.sfx('tick');
      saveSettings(settings);
    });
    onClick('set-musicon', () => {
      audio.ensure();
      audio.toggleMusic();
      this.syncSettingsWidgets();
    });
    onClick('set-voice', () => {
      settings.voice = !settings.voice;
      audio.voiceOn = settings.voice;
      if (settings.voice) audio.say('Voice online', true);
      this.syncSettingsWidgets();
      saveSettings(settings);
    });
    onInput('set-camspeed', (e) => {
      settings.camSpeed = parseFloat(e.target.value);
      saveSettings(settings);
    });
    onInput('set-gamespeed', (e) => {
      settings.gameSpeed = parseFloat(e.target.value);
      this.deps.setSpeed(settings.gameSpeed);
      byId('set-gamespeed-val').textContent = `${settings.gameSpeed.toFixed(1)}×`;
      saveSettings(settings);
    });
    onClick('set-edge', () => {
      settings.edgeScroll = !settings.edgeScroll;
      this.syncSettingsWidgets();
      saveSettings(settings);
    });

    // briefing/end screens also advance on click/tap (touch, embedded iframes)
    for (const el of [this.elBrief, this.elEnd]) el.addEventListener('click', () => this.advanceScreen());

    // Autoplay policy: nothing sounds until the first user gesture. On that
    // gesture unlock the context and — if we're still on the title/setup
    // screens — kick off the menu theme so the title has music from the very
    // first click or keypress.
    const armAudio = () => {
      if (this.audioArmed) return;
      this.audioArmed = true;
      audio.ensure(); audio.resume();
      if ((this.state === 'title' || this.state === 'setup') && audio.musicOn) audio.playMenu();
    };
    window.addEventListener('pointerdown', armAudio);
    window.addEventListener('keydown', armAudio);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.menuOpen) this.advanceScreen();
      if (e.code === 'Escape') {
        if (this.menuOpen) { this.closeMenu(); return; }
        if (this.state === 'play') {
          if (!this.deps.getInput().consumeEscape()) this.openMenu('pause');
        } else if (this.state === 'setup') this.showTitle();
      }
      if (e.code === 'KeyP' && this.state === 'play' && !this.menuOpen) {
        this.paused = !this.paused;
        this.elPaused.style.display = this.paused ? 'flex' : 'none';
      }
      if (e.code === 'KeyM') {
        audio.ensure();
        audio.toggleMusic();
      }
    });
  }
}
