/**
 * 首次门派任务：药材护送链（票据 002/004）。
 * 领命 → 路线抉择 → 途中 → 重伤驿卒 → 必经伏击战 → 四结局 → 调查 → 交付 → 返城 → 四级结算 → 入门仪式。
 * 证明兑现：武艺→先手；人情→额外药材/路线情报；品行→同行者初始信任与救援配合。
 */
import { flagBool, type GameState } from "../engine/state";
import { BALANCE, RAIN_TRAVEL_MULT } from "../engine/balance";
import type { EndingTier, EscortState } from "../engine/state";
import type { StoryUnit } from "../game/stories";
import { PENDING_COMBAT_FLAG } from "./stories.life";

/** 护送开始：由 escort.route 的选择调用。
 * 出发路程不在此直改时钟——写入 escort.pendingTravel，由事务管线集中推进并结算体力消耗（票据 003）。 */
export const PENDING_TRAVEL_FLAG = "escort.pendingTravel";

function depart(s: GameState, route: "山道" | "官道"): void {
  const intel = s.world.proofs.social.length > 0 && s.escort?.supplies.routeIntel;
  const weatherMult = s.world.weather === "雨" ? RAIN_TRAVEL_MULT : 1;
  const base = route === "山道" ? 80 : 120;
  const minutes = Math.round(base * weatherMult * (intel ? 0.85 : 1));
  if (s.escort) {
    s.escort.route = route;
    s.escort.phase = "途中";
    // 起算点与死线在事务层推进完成后由 pendingTravel 落定（见 transaction.commit）
    s.stories.flags[PENDING_TRAVEL_FLAG] = minutes;
  }
}

function hasProof(s: GameState, kind: "martial" | "social" | "virtue"): boolean {
  return s.world.proofs[kind].length > 0;
}

export function computeVerdict(s: GameState): { tier: EndingTier; detail: string } {
  const esc = s.escort;
  if (!esc) return { tier: "完成", detail: "" };
  const late = s.clock.minutes > esc.deadlineMinute;
  const clues = esc.clues.length;
  const delivered = esc.cargo > 0 && !late;
  const allClues = clues >= 2;
  const saved = esc.courierSaved === true;
  if (esc.fightOutcome === "defeated") {
    return { tier: "惨败", detail: "战败被救回，货物尽失，仅余零星线索。" };
  }
  if (!delivered || esc.fightOutcome === "captured") {
    return {
      tier: "失利",
      detail:
        esc.fightOutcome === "captured"
          ? "遭擒后脱身，货物尽失，但窥见袭击者真面目。"
          : late
            ? "误了时限，药材虽在，驿站险些误事。"
            : "货物没能完整送到，所带回的情报尚算有用。",
    };
  }
  if (esc.fightOutcome === "victory" && saved && esc.cargo >= 85 && allClues) {
    return { tier: "圆满", detail: "驿卒获救、药材完好送达、袭击者身份查实。" };
  }
  return { tier: "完成", detail: "药材送到，但人员、时间或物资有所折损。" };
}

function verdictEffects(s: GameState): void {
  let { tier } = computeVerdict(s);
  // 票据 002：担保入门者首次任务评价条件更严——圆满降为完成
  if (s.world.exam.guaranteed && tier === "圆满") tier = "完成";
  s.stories.flags["escort.tier"] = tier;
  if (tier === "圆满") {
    s.sect.trust += 3;
    s.sect.contribution += 20;
  } else if (tier === "完成") {
    s.sect.trust += 1;
    s.sect.contribution += 10;
  } else if (tier === "失利") {
    s.sect.trust -= 1;
    s.player.debt += 200;
  } else {
    s.sect.trust -= 3;
    s.player.debt += 100;
    s.sect.observation = true;
  }
  s.sect.trust = Math.max(-10, Math.min(10, s.sect.trust));
  s.sect.contribution = Math.max(0, Math.min(100, s.sect.contribution));
}

const esc = (s: GameState): EscortState => s.escort!;

export const ESCORT_UNITS: StoryUnit[] = [
  {
    id: "escort.take",
    title: "照川门 · 领命",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => [
      "顾执事把一只封着火漆的药箱推到你面前：“青云驿遭袭，驿道上的伤兵等着这批药材。照川门接了这趟善后。”",
      "“带队的是沈青梧，外加一个脚夫。路上不太平，你自己当心。”沈青梧在旁抱拳一礼，眼神在你行囊上停了停。",
      s.world.proofs.social.length > 0 ? "（你有人情在身，或可讨些照应）" : "",
      s.world.proofs.virtue.length > 0 ? "（沈青梧听过你品行端方，神色缓和）" : "",
      s.world.proofs.martial.length > 0 ? "（武艺证明在手，沈青梧让出了半步身位）" : "",
    ].filter(Boolean),
    choices: [
      {
        id: "intel",
        label: "向顾执事讨路线情报",
        note: "需人情证明；行进更快、敌袭更易察觉",
        when: (s) => (hasProof(s, "social") ? null : "无人情证明，执事不会多言"),
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) s.escort.supplies.routeIntel = true; } },
          { t: "logline", text: "顾执事摊开舆图，把山道几处岔口一一指给你。" },
        ],
        next: "escort.route",
      },
      {
        id: "herbs",
        label: "开口多领一份伤药",
        note: "需人情证明；药材担更足",
        when: (s) => (hasProof(s, "social") ? null : "与药行无人情，多领不得"),
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) s.escort.supplies.extraHerbs = true; } },
          { t: "logline", text: "脚夫又捆了一包伤药上担。" },
        ],
        next: "escort.route",
      },
      {
        id: "depart",
        label: "封箱出发",
        effects: [],
        next: "escort.route",
      },
    ],
  },
  {
    id: "escort.route",
    title: "城门 · 分岔路口",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => {
      const w = s.world.weather;
      return [
        "城门在望。往青云驿去有两条路：",
        "山道穿岭而过，近，可省半个时辰；只是岭子新近不太平。",
        "官道绕行，远半个时辰，但路面宽整，视野开阔。",
        w === "雨" ? "（细雨绵绵，山道只怕泥泞）" : w === "风" ? "（风势不小，山口风声如哨）" : "",
      ].filter(Boolean);
    },
    choices: [
      {
        id: "mountain",
        label: "走山道",
        note: "近半个时辰；有埋伏之险",
        minutes: 0,
        effects: [{ t: "custom", fn: (s) => depart(s, "山道") }],
        next: "escort.mountain",
      },
      {
        id: "road",
        label: "走官道",
        note: "远半个时辰；稳妥",
        minutes: 0,
        effects: [{ t: "custom", fn: (s) => depart(s, "官道") }],
        next: "escort.road",
      },
    ],
  },
  {
    id: "escort.mountain",
    title: "山道 · 松涛",
    entry: false,
    priority: 2,
    weight: 1,
    onEnter: [{ tag: "察觉", attr: "com", label: "察觉", difficulty: 45 }],
    text: (s, checks) => {
      const alert = checks["察觉"] && (checks["察觉"].band === "大成功" || checks["察觉"].band === "成功");
      const lines = [
        "山道转过一道弯，松涛声里混进一声闷哼。带队弟子抬手止住队伍。",
        alert
          ? "你注意到坡上的灌木新折了几枝——断口还新，有人为的痕迹。"
          : "风里没有第二个人声。太安静了。",
      ];
      if (flagBool(s, "world.banditRumor")) lines.push("（你想起茶棚里听来的话：山匪用着制式腰刀。）");
      return lines;
    },
    choices: [
      {
        id: "shortcut",
        label: "抄近道翻坡",
        note: "省时；耗体力；身法检定，失则折损货担",
        minutes: 20,
        cost: { stamina: 20 },
        check: { tag: "翻坡", attr: "agi", label: "身法", difficulty: 50 },
        bands: {
          大成功: { logline: "你领着队伍从岩缝里穿过去，落地时货担纹丝没晃。", effects: [] },
          成功: { logline: "翻坡费了些手脚，总算安然。", effects: [] },
          失败: { logline: "坡上碎石一滑，货担磕在岩角，封签裂了道缝。", effects: [{ t: "cargo", delta: -10 }] },
          大失败: { logline: "你脚下一空滚下土坡，连带半担药材撒了。", effects: [{ t: "cargo", delta: -25 }, { t: "wound", severity: "轻伤", source: "翻坡摔伤" }] },
        },
        next: "escort.courier",
      },
      {
        id: "steady",
        label: "沿道稳走",
        note: "多耗些时辰，安然",
        minutes: 40,
        effects: [{ t: "logline", text: "队伍贴着里侧山壁缓步而行。" }],
        next: "escort.courier",
      },
    ],
  },
  {
    id: "escort.road",
    title: "官道 · 尘烟",
    entry: false,
    priority: 2,
    weight: 1,
    text: () => [
      "官道上车辙纵横。半路遇上一队逃难的百姓，扶老携幼，望着药箱直咽唾沫。",
      "沈青梧低声道：“驿站伤兵等着药。可这十里无铺，他们……唉。”",
    ],
    choices: [
      {
        id: "share",
        label: "分他们两张干粮",
        cost: { item: { id: "ration", count: 1 } },
        effects: [{ t: "trust", delta: 1 }, { t: "logline", text: "干粮分下去，一个老妪拉着你的手直念叨。沈青梧看你的眼神柔和了些。" }],
        next: "escort.courier",
      },
      {
        id: "press",
        label: "赶路要紧，径直通过",
        effects: [{ t: "logline", text: "队伍从人群边掠过。沈青梧没说话，只是回头看了一眼。" }],
        next: "escort.courier",
      },
    ],
  },
  {
    id: "escort.courier",
    title: "驿道 · 重伤驿卒",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => [
      "前方坡下歪着一辆驿车，车旁伏着一名驿卒，衣背渗血，气息奄奄。",
      "脚夫倒吸一口凉气，下意识抱紧了药材担。",
      `（距辰时之约还有约 ${Math.max(0, Math.round(((esc(s).deadlineMinute - s.clock.minutes) / 60) * 10) / 10)} 个时辰）`,
    ],
    choices: [
      {
        id: "rescue-salve",
        label: "敷药施救，抬人同行",
        note: "耗跌打药×1、两刻钟；驿卒可作证",
        minutes: 45,
        cost: { item: { id: "salve", count: 1 } },
        when: (s) => ((s.inventory["salve"] ?? 0) >= 1 ? null : "没有跌打药"),
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) { s.escort.courierSaved = true; s.escort.courierTended = true; } } },
          { t: "trust", delta: 2 },
          { t: "custom", fn: (s) => { s.player.stamina = Math.max(0, s.player.stamina - (s.world.proofs.virtue.length > 0 ? 10 : 15)); } },
          { t: "custom", fn: (s) => {
              if (s.world.proofs.virtue.length > 0) {
                s.log.push({ at: s.clock.minutes, kind: "story", text: "你手脚利落地包扎止血——品行端方之人，救人时自有章法。沈青梧赞许点头。" });
              } else {
                s.log.push({ at: s.clock.minutes, kind: "story", text: "你按住伤口敷上药，与脚夫轮换着把人抬上车。沈青梧默认了这份拖延。" });
              }
            } },
        ],
        next: "escort.ambush",
      },
      {
        id: "rescue-parcel",
        label: "用药担备伤药替他止血",
        note: "人情证明多领的药材；一刻钟",
        minutes: 30,
        when: (s) => (s.escort?.supplies.extraHerbs ? null : "未多领伤药"),
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) { s.escort.courierSaved = true; s.escort.courierTended = true; } } },
          { t: "trust", delta: 1 },
          { t: "logline", text: "药担里多出的那包伤药正好用上。驿卒缓过一口气，被安置进车厢。" },
        ],
        next: "escort.ambush",
      },
      {
        id: "rescue-goldsalve",
        label: "用金疮药替他止血",
        note: "耗金疮药×1、一刻钟；战斗备用药少一瓶",
        minutes: 30,
        cost: { item: { id: "gold-salve", count: 1 } },
        when: (s) => ((s.inventory["gold-salve"] ?? 0) >= 1 ? null : "没有金疮药"),
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) { s.escort.courierSaved = true; s.escort.courierTended = true; } } },
          { t: "trust", delta: 1 },
          { t: "logline", text: "金疮药止血最速。驿卒缓过一口气，被安置进车厢。" },
        ],
        next: "escort.ambush",
      },
      {
        id: "mark",
        label: "留水粮作记号，托过路人照看",
        note: "一刻钟；不耗药品",
        minutes: 15,
        cost: { item: { id: "ration", count: 1 } },
        when: (s) => ((s.inventory["ration"] ?? 0) >= 1 ? null : "没有多余水粮"),
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) s.escort.courierSaved = false; } },
          { t: "logline", text: "你留了水粮，把他挪到树荫下。他抓着你的袖口，嘴里含混念着什么。" },
        ],
        next: "escort.ambush",
      },
      {
        id: "leave",
        label: "不能停，赶路要紧",
        note: "同行者看在眼里",
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) s.escort.courierSaved = false; } },
          { t: "trust", delta: -2 },
          { t: "logline", text: "你别过脸去：“走。”队伍加快了脚步。" },
        ],
        next: "escort.ambush",
      },
    ],
  },
  {
    id: "escort.ambush",
    title: "松林 · 伏击",
    entry: false,
    priority: 2,
    weight: 1,
    onEnter: [{ tag: "伏击察觉", attr: "agi", label: "察觉伏击", difficulty: 50 }],
    text: (s, checks) => {
      const c = checks["伏击察觉"];
      const lines: string[] = [];
      if (c && (c.band === "大成功" || c.band === "成功")) {
        lines.push("坡上灌木无风自动——你先一步瞧见了反光！");
        s.stories.flags["escort.alerted"] = true;
      } else {
        lines.push("“此山是我开——”戏文里的词还没念完，坡上滚下七八条人影，刀光在日头底下一闪。");
      }
      lines.push("领头那人蒙着面，腰间一杆制式腰刀。脚夫腿一软瘫坐在地，沈青梧拔剑在手：“护住药担！”");
      lines.push(hasProof(s, "martial") ? "（你的手按上了兵刃——武艺在身，此战你抢得先手。）" : "");
      return lines.filter(Boolean);
    },
    choices: [
      {
        id: "fight",
        label: "迎头痛击",
        note: "必经一战",
        effects: [
          { t: "custom", fn: (s) => { s.stories.flags[PENDING_COMBAT_FLAG] = "ambush"; } },
        ],
      },
      {
        id: "guard",
        label: "先护货担再战",
        note: "首回合稳守，货物不易折损",
        effects: [
          { t: "custom", fn: (s) => { s.stories.flags["escort.guardFirst"] = true; s.stories.flags[PENDING_COMBAT_FLAG] = "ambush"; } },
        ],
      },
      {
        id: "together",
        label: "招呼沈青梧联手",
        note: "同行者协力；信任过低则不配合",
        when: (s) => (esc(s).trust >= -5 ? null : "沈青梧不愿与你配合"),
        effects: [
          { t: "trust", delta: 1 },
          { t: "custom", fn: (s) => { s.stories.flags["escort.joined"] = true; s.stories.flags[PENDING_COMBAT_FLAG] = "ambush"; } },
        ],
      },
    ],
  },
  {
    id: "escort.fight.victory",
    title: "战后 · 伏击已破",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => [
      "领头蒙面人被你一记扫在肩头，踉跄遁入林中，余下几人抬着伤者四散而逃。",
      "地上遗落一杆腰刀、几只撕开的药囊。沈青梧抹了把脸：“好身手。”",
      s.world.proofs.virtue.length > 0 || flagBool(s, "escort.joined") ? "脚夫连滚带爬地凑过来，一个劲给你作揖。" : "",
    ].filter(Boolean),
    choices: [
      {
        id: "next",
        label: "清点队伍，继续赶路",
        effects: [{ t: "clue", id: "clue.gear" }, { t: "logline", text: "【线索·装备】你拾起那杆制式腰刀——刀身刻着古怪记号。" }],
        next: "escort.investigate",
      },
    ],
  },
  {
    id: "escort.fight.fled",
    title: "脱战 · 弃货",
    entry: false,
    priority: 2,
    weight: 1,
    text: () => [
      "你且战且退，把追兵引偏了方向。等甩脱人影回头清点——药担被砍翻在地，药囊散了一坡。",
      "沈青梧脸色发白，脚夫蹲在地上直哆嗦。所幸人都没死。",
    ],
    choices: [
      {
        id: "salvage",
        label: "能抢回多少是多少",
        minutes: 20,
        effects: [{ t: "cargo", delta: -50 }, { t: "logline", text: "你们手忙脚乱收拾残药，重新捆扎。" }],
        next: "escort.investigate",
      },
    ],
  },
  {
    id: "escort.fight.defeated",
    title: "昏沉 · 获救",
    entry: false,
    priority: 2,
    weight: 1,
    text: () => [
      "耳边嗡鸣，眼前发黑。倒下去之前，你看见沈青梧红着眼扑过来挡在你身前——而后天地翻转，什么都不知道了。",
      "再睁眼，是在回城的车板上。药担空空，人皆无恙，唯你伤得最重。",
    ],
    choices: [
      {
        id: "wake",
        label: "强撑着坐起来",
        effects: [
          { t: "custom", fn: (s) => { if (s.escort) { s.escort.cargo = 0; s.escort.fightOutcome = "defeated"; } } },
          { t: "trust", delta: -1 },
          { t: "logline", text: "沈青梧别过脸去：“药材全丢了。你先养伤。”" },
        ],
        next: "escort.verdict",
      },
    ],
  },
  {
    id: "escort.fight.captured",
    title: "被擒 · 林中营地",
    entry: false,
    priority: 2,
    weight: 1,
    text: () => [
      "后脑一凉，你被人按倒捆了。药担被顺手掳走，沈青梧被缠住脱不开身。",
      "蒙面人把你拖进林子深处。途中他的面巾被树枝挂掉半边——你看见了他脸颊的疤。",
    ],
    choices: [
      {
        id: "struggle",
        label: "趁看守换班挣脱绳索",
        note: "身法检定",
        check: { tag: "挣脱", attr: "agi", label: "身法", difficulty: 50 },
        bands: {
          大成功: { logline: "绳扣一寸寸褪开。你摸回路口时，正撞上闻讯寻来的沈青梧。", effects: [{ t: "clue", id: "clue.face" }, { t: "logline", text: "【线索·真面目】你记清了那人的脸与疤。" }] },
          成功: { logline: "你脱出束缚，循着来路摸回官道。", effects: [{ t: "clue", id: "clue.face" }, { t: "logline", text: "【线索·真面目】你记清了那人的脸与疤。" }] },
          失败: { logline: "绳结太紧，看守折返，你白挨了两脚。所幸天黑后沈青梧带着人寻了过来。", effects: [{ t: "trust", delta: 2 }] },
          大失败: { logline: "你弄出声响，被堵嘴按回地上。夜里沈青梧拼死袭营才把你背出来。", effects: [{ t: "trust", delta: 3 }, { t: "wound", severity: "轻伤", source: "被囚时挨打" }] },
        },
        next: "escort.verdict",
      },
    ],
  },
  {
    id: "escort.investigate",
    title: "驿道 · 线索",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => {
      const got = s.escort?.clues ?? [];
      return [
        "青云驿的轮廓已在官道尽头。赶在进驿之前，还有些零碎值得收拾。",
        `已到手的线索：${got.length ? got.map(clueName).join("、") : "尚无"}。若有两条，便能坐实袭击者身份。`,
      ];
    },
    choices: [
      {
        id: "seal",
        label: "细看药囊封签",
        note: "线索：封签",
        when: (s) => (s.escort?.clues.includes("clue.seal") ? "已查验" : null),
        effects: [
          { t: "clue", id: "clue.seal" },
          { t: "logline", text: "【线索·封签】封签的药行印记有人为涂改——有人想遮住这批药的来路。" },
        ],
        next: "escort.investigate",
      },
      {
        id: "witness",
        label: "问陈驿卒当日情形",
        note: "线索：证词（需救下驿卒）",
        when: (s) =>
          s.escort?.courierSaved
            ? s.escort.clues.includes("clue.testimony")
              ? "已问过"
              : null
            : "驿卒未获救，无人可问",
        effects: [
          { t: "clue", id: "clue.testimony" },
          { t: "logline", text: "【线索·证词】陈驿卒嘶声道：“不是山匪……是镖局的护院，围着蓝布巾……”" },
        ],
        next: "escort.investigate",
      },
      {
        id: "depart",
        label: "进驿交付",
        minutes: 30,
        effects: [],
        next: "escort.deliver",
      },
    ],
  },
  {
    id: "escort.deliver",
    title: "青云驿 · 交付",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => {
      const e = s.escort!;
      const late = s.clock.minutes > e.deadlineMinute;
      const lines: string[] = [];
      lines.push("驿站里焦糊味未散。驿丞迎出来，身后躺着一排伤兵。");
      if (e.cargo >= 85) lines.push("药箱火漆完好，药囊齐整。驿丞长揖到地：“救命的东西，一分不少。”");
      else if (e.cargo > 0) lines.push(`药担损了些，剩下的${e.cargo > 40 ? "还够伤兵们撑过这几日" : "只够救最要紧的几个人"}。驿丞千恩万谢，眉头却没全展。`);
      else lines.push("你空着手站在驿门前。驿丞的脸一点点沉下去，伤兵的呻吟声从门里传出来。");
      if (late) lines.push("（你们误了辰时之约——驿站昨夜已开始断药。）");
      if (e.courierSaved) lines.push("陈驿卒被安置进厢房，驿丞握着他的手直掉泪。");
      return lines;
    },
    choices: [
      {
        id: "return",
        label: "交割完毕，随队回城",
        minutes: 60,
        effects: [{ t: "custom", fn: (s) => { if (s.escort) { s.escort.phase = "返城"; s.location = "sect-post"; } } }],
        next: "escort.verdict",
      },
    ],
  },
  {
    id: "escort.verdict",
    title: "照川门 · 复命",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => {
      const { tier, detail } = computeVerdict(s);
      const lines = [
        "驻点堂内，顾执事听完沈青梧的禀报，久久不语。",
        `“${tier}。”他最终落了两个字，“${detail}”`,
      ];
      if (tier === "圆满") lines.push("“头一趟差事办成这样，门里上下都会记得你。”");
      else if (tier === "完成") lines.push("“瑕不掩瑜。入门之后，好生当差。”");
      else if (tier === "失利") lines.push("“货没了，情报却真。赔偿从你名下扣。入门照旧——照川门不养闲人，也不苛待敢把话说全的人。”");
      else lines.push("“人回来就好。入门可以，先立观察期。伤养好，债背好，往后再证明你自己。”");
      return lines;
    },
    choices: [
      {
        id: "report",
        label: "躬身复命",
        effects: [{ t: "custom", fn: (s) => verdictEffects(s) }],
        next: "escort.ceremony",
      },
    ],
  },
  {
    id: "escort.ceremony",
    title: "入门 · 照川问名",
    entry: false,
    priority: 2,
    weight: 1,
    text: (s) => {
      const tier = (s.stories.flags["escort.tier"] as EndingTier) ?? "完成";
      return [
        "三日后，驻点小院，香案朝东。",
        "顾执事亲自主持：“照川门收人，问出身，更问行止。今日起，你便是我照川门记名弟子。”",
        `“此番差事，评为【${tier}】。授你《基础吐纳法》一册——内息之基，日日不可废。”`,
        "“至于往后习武的路数，剑术、拳掌、轻身，你自己拣一条走。”",
      ];
    },
    choices: [
      {
        id: "sword",
        label: "剑术——堂堂之阵",
        note: "入门方向：剑术",
        effects: [{ t: "custom", fn: (s) => finishEntry(s, "剑术") }],
      },
      {
        id: "fist",
        label: "拳掌——贴身短打",
        note: "入门方向：拳掌",
        effects: [{ t: "custom", fn: (s) => finishEntry(s, "拳掌") }],
      },
      {
        id: "agility",
        label: "轻身——来去如风",
        note: "入门方向：轻身",
        effects: [{ t: "custom", fn: (s) => finishEntry(s, "轻身") }],
      },
    ],
  },
];

function finishEntry(s: GameState, direction: "剑术" | "拳掌" | "轻身"): void {
  const tier = (s.stories.flags["escort.tier"] as EndingTier) ?? "完成";
  const { detail } = computeVerdict(s);
  s.role = "记名弟子";
  s.stories.flags["sect.direction"] = direction;
  s.inventory["gold-salve"] = (s.inventory["gold-salve"] ?? 0) + 1;
  s.ending = {
    tier,
    settledMinute: s.clock.minutes,
    detail,
    direction,
  };
  s.stories.active = null;
  if (s.escort) s.escort.phase = "结束";
}

export function clueName(id: string): string {
  switch (id) {
    case "clue.seal":
      return "封签";
    case "clue.gear":
      return "装备";
    case "clue.testimony":
      return "证词";
    case "clue.face":
      return "真面目";
    default:
      return id;
  }
}
