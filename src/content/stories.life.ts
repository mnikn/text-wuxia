/**
 * 生活与资格故事单元（票据 002/008/009）：
 * 出身专属 ×3、环境与生活 ×16、资格证明链（每类证明 ≥2 路径）、门派考核与担保。
 * 命名约定：地点.主题.变体（票据 009）。
 */
import { flagNum, flagBool, type GameState } from "../engine/state";
import type { StoryUnit } from "../game/stories";
import { BALANCE } from "../engine/balance";

const hasProof = (s: GameState, kind: "martial" | "social" | "virtue", id: string): boolean =>
  s.world.proofs[kind].includes(id);

const proofCount = (s: GameState): number =>
  s.world.proofs.martial.length + s.world.proofs.social.length + s.world.proofs.virtue.length;

export const LIFE_UNITS: StoryUnit[] = [
  /* ================ 出身专属单元（票据 002：每种出身 1 个） ================ */
  {
    id: "origin.refugee",
    title: "城隍庙的一碗粥",
    entry: true,
    priority: 4,
    weight: 20,
    once: true,
    when: (s) => s.player.origin === "refugee" && s.location === "temple",
    text: () => [
      "你背着全部家当挪进城隍庙侧殿时，庙祝正搅着一锅稀粥。",
      "老人头也不抬：“北边来的？锅里有粥，墙角有位置。城里的规矩，庙里的规矩，住下了自然有人教你。”",
    ],
    choices: [
      {
        id: "bowl",
        label: "道谢，喝粥安顿",
        note: "得一碗热粥，庙祝记住了你",
        effects: [
          { t: "hunger", delta: -40 },
          { t: "relation", npc: "miao-priest", delta: 1 },
          { t: "logline", text: "庙祝指给你墙角最干燥的一块地铺。" },
        ],
      },
    ],
  },
  {
    id: "origin.porter",
    title: "码头的旧相识",
    entry: true,
    priority: 4,
    weight: 20,
    once: true,
    when: (s) => s.player.origin === "porter" && s.location === "wharf",
    text: () => [
      "你刚踏上码头跳板，就有人一巴掌拍在你肩上——是当年同船的马把头。",
      "“杂役小子？队散了就散了，人还得吃饭。我这儿常年缺扛活的，手脚麻利就来。”",
    ],
    choices: [
      {
        id: "greet",
        label: "见礼，应下",
        note: "马把头记起了你",
        effects: [
          { t: "relation", npc: "ma-foreman", delta: 1 },
          { t: "logline", text: "马把头朝货堆努努嘴：“先从轻的搬起。”" },
        ],
      },
    ],
  },
  {
    id: "origin.student",
    title: "武馆门前的旧影子",
    entry: true,
    priority: 4,
    weight: 20,
    once: true,
    when: (s) => s.player.origin === "student" && s.location === "school",
    text: () => [
      "铁教头瞥了你一眼，视线在你扎的马步上停了停。",
      "“别处的弃徒。”他语气说不上好坏，“底子是底子，脸面是脸面。想练就练，想讨教，先扎够两个时辰桩。”",
    ],
    choices: [
      {
        id: "stance",
        label: "默不作声，扎桩",
        note: "武艺小幅精进",
        effects: [
          { t: "skill", delta: 3 },
          { t: "relation", npc: "tie-coach", delta: 1 },
          { t: "logline", text: "两个时辰桩功站下来，腿肚子直打颤。" },
        ],
        minutes: 60,
        cost: { stamina: 15 },
      },
    ],
  },

  /* ================ 环境与生活单元（票据 002：12～18 个） ================ */
  {
    id: "life.market.pickpocket",
    title: "市集 · 第三只手",
    entry: true,
    priority: 4,
    weight: 10,
    cooldownMinutes: 1440,
    mutex: "market",
    when: (s) => s.location === "market",
    text: () => [
      "人潮里一个半大孩子贴着你挤了过去，怀里的钱袋一轻。",
    ],
    choices: [
      {
        id: "grab",
        label: "一把扣住他手腕",
        note: "身法检定",
        check: { tag: "抓捕", attr: "agi", label: "身法", difficulty: 45 },
        bands: {
          大成功: { logline: "你反手拿住他手腕，动弹不得。失主赶到，赏了你 30 文。", effects: [{ t: "money", delta: 30 }, { t: "relation", npc: "bai-innkeeper", delta: 1 }], next: "life.market.pickpocket.reward" },
          成功: { logline: "你扣住了他，钱袋失而复得。", effects: [{ t: "item", id: "ration", count: 1 }], next: "life.market.pickpocket.reward" },
          失败: { logline: "孩子一滑像条泥鳅，钻进人堆没了影。", effects: [{ t: "stamina", delta: -10 }] },
          大失败: { logline: "你扑了个空，自己摔了个趔趄，惹来一片哄笑。", effects: [{ t: "wound", severity: "轻伤", source: "摔了一跤" }] },
        },
      },
      {
        id: "shout",
        label: "扬声喝破",
        note: "惊走扒手，失主道谢",
        minutes: 10,
        effects: [{ t: "logline", text: "孩子吓得一哆嗦，钱袋掉在地上。失主千恩万谢。" }],
      },
    ],
  },
  {
    id: "life.market.pickpocket.reward",
    title: "市集 · 失主道谢",
    entry: false,
    priority: 4,
    weight: 1,
    text: () => ["失主是个绸缎商，非要塞给你点谢礼不可。"],
    choices: [
      {
        id: "take-money",
        label: "收下 30 文",
        effects: [{ t: "money", delta: 30 }],
      },
      {
        id: "decline",
        label: "摆手谢绝",
        note: "白掌柜听说了此事",
        effects: [{ t: "relation", npc: "bai-innkeeper", delta: 1 }],
      },
    ],
  },
  {
    id: "life.market.drunk",
    title: "市集 · 醉汉冲撞",
    entry: true,
    priority: 4,
    weight: 10,
    cooldownMinutes: 1440,
    mutex: "market",
    when: (s) => s.location === "market",
    text: () => ["一个醉汉挥着酒葫芦横冲直撞，眼看要掀翻菜摊，摊主急得直跺脚。"],
    choices: [
      {
        id: "help",
        label: "上前架住醉汉",
        note: "耗些体力；摊主与客栈掌柜都看着",
        minutes: 20,
        cost: { stamina: 10 },
        effects: [
          { t: "relation", npc: "bai-innkeeper", delta: 1 },
          { t: "logline", text: "你半拖半架把人弄到墙根。摊主塞给你两根黄瓜，白掌柜恰巧买菜路过，多看了你一眼。" },
        ],
      },
      { id: "avoid", label: "避开，不趟浑水", effects: [{ t: "logline", text: "你侧身让开。菜摊哗啦一声翻了。" }] },
    ],
  },
  {
    id: "life.inn.noise",
    title: "客栈 · 夜半异响",
    entry: true,
    priority: 4,
    weight: 8,
    cooldownMinutes: 1440,
    mutex: "inn",
    when: (s) => s.location === "inn",
    text: () => ["后半夜，院子里传来窸窸窣窣的响动，夹着一声压低的闷哼。"],
    choices: [
      {
        id: "look",
        label: "披衣起身查看",
        note: "是个受了伤的行脚商人",
        check: { tag: "察觉", attr: "com", label: "定力", difficulty: 40 },
        bands: {
          大成功: { logline: "你循声包抄，把捂着刀伤的行脚商堵在了墙角。他愿出 50 文请你保密并请白掌柜来。", effects: [{ t: "money", delta: 50 }, { t: "logline", text: "商人透了句口风：官道青云驿前几天遇了袭。" }] },
          成功: { logline: "你寻到受了伤的行脚商人，帮 он叫醒了掌柜。", effects: [{ t: "relation", npc: "bai-innkeeper", delta: 1 }] },
          失败: { logline: "你转了一圈只看到一地脚印，人早翻墙走了。" },
          大失败: { logline: "你被门槛绊了个大马趴，惊起满院鸡飞。白掌柜披着衣裳骂了半夜。" },
        },
      },
      { id: "ignore", label: "江湖地方，少管闲事", effects: [{ t: "logline", text: "你翻了个身。响动很快停了。" }] },
    ],
  },
  {
    id: "life.temple.beggar",
    title: "城隍庙 · 乞儿",
    entry: true,
    priority: 4,
    weight: 10,
    cooldownMinutes: 1440,
    mutex: "temple",
    when: (s) => s.location === "temple",
    text: (s) => {
      const n = flagNum(s, "life.templeKindness");
      return n >= 2
        ? ["那乞儿老远看见你就笑，也不伸手，只规规矩矩磕了个头。"]
        : ["一个面黄肌瘦的乞儿缩在殿角，怯生生望着你手里的干粮。"];
    },
    choices: [
      {
        id: "food",
        label: "分他一张干粮",
        cost: { item: { id: "ration", count: 1 } },
        effects: [{ t: "custom", fn: (s) => { s.stories.flags["life.templeKindness"] = flagNum(s, "life.templeKindness") + 1; } }, { t: "relation", npc: "miao-priest", delta: 1 }, { t: "logline", text: "乞儿捧着干粮直作揖。庙祝在旁边看着，捻须不语。" }],
      },
      {
        id: "coin",
        label: "给 10 文买口热汤",
        cost: { money: 10 },
        effects: [{ t: "custom", fn: (s) => { s.stories.flags["life.templeKindness"] = flagNum(s, "life.templeKindness") + 1; } }, { t: "relation", npc: "miao-priest", delta: 1 }],
      },
      { id: "refuse", label: "自家也难，摇头走开", effects: [{ t: "relation", npc: "miao-priest", delta: -1 }] },
    ],
  },
  {
    id: "life.temple.trust",
    title: "城隍庙 · 庙祝作保",
    entry: true,
    priority: 4,
    weight: 15,
    once: true,
    when: (s) => s.location === "temple" && flagNum(s, "life.templeKindness") >= 2 && !hasProof(s, "virtue", "品行·庙祝作保") && s.role === "游子",
    text: () => [
      "庙祝叫住你：“这些日子，你帮扶那小的，老道都看在眼里。”",
      "“照川门收人，不光看拳头。你若要用得着，老道给你写个善行凭据。”",
    ],
    choices: [
      {
        id: "accept",
        label: "恭敬接过凭据",
        note: "获得品行证明",
        effects: [
          { t: "proof", kind: "virtue", id: "品行·庙祝作保" },
          { t: "relation", npc: "miao-priest", delta: 1 },
          { t: "logline", text: "【入门证明】品行证明到手：城隍庙庙祝作保。" },
        ],
      },
    ],
  },
  {
    id: "life.market.purse",
    title: "市集 · 路不拾遗",
    entry: true,
    priority: 4,
    weight: 6,
    once: true,
    mutex: "market",
    when: (s) => s.location === "market" && !flagBool(s, "life.keptPurse"),
    text: () => ["墙根下躺着个鼓囊囊的钱袋，抽绳上系着算盘珠——是账房先生的做派。四下无人。"],
    choices: [
      {
        id: "return",
        label: "在原地等失主",
        note: "得品行证明；失主是衙门书吏",
        minutes: 30,
        effects: [
          { t: "proof", kind: "virtue", id: "品行·拾金不昧" },
          { t: "logline", text: "【入门证明】品行证明到手：拾金不昧，失主具了张善行文书。" },
        ],
      },
      {
        id: "keep",
        label: "收进怀里",
        note: "钱袋入囊，再无人知",
        effects: [
          { t: "money", delta: 80 },
          { t: "custom", fn: (s) => { s.stories.flags["life.keptPurse"] = true; } },
          { t: "logline", text: "你四下张望一番，把钱袋收进了怀里。" },
        ],
      },
    ],
  },
  {
    id: "life.rumor.bandit",
    title: "茶棚闲话 · 山匪",
    entry: true,
    priority: 4,
    weight: 8,
    once: true,
    when: () => true,
    text: () => [
      "几个脚夫蹲在檐下抽烟闲话：“近山道不太平，说是有‘山匪’劫掠行客。”",
      "“放屁，”另一个啐了一口，“山匪哪来的制式腰刀？我看倒像哪家的护院。”",
    ],
    choices: [
      {
        id: "listen",
        label: "凑过去细听",
        effects: [{ t: "custom", fn: (s) => { s.stories.flags["world.banditRumor"] = true; } }, { t: "logline", text: "你记下了：山道有假扮山匪的人，用着制式腰刀。" }],
      },
    ],
  },
  {
    id: "life.rumor.escort",
    title: "街谈巷议 · 驿站遇袭",
    entry: true,
    priority: 4,
    weight: 8,
    once: true,
    when: (s) => day(s) >= 2,
    text: () => [
      "街上都在传：官道上的青云驿遭了劫，驿卒死伤，官府封了道查案。",
      "“照川门的人在县里驻着，听说要找可靠人往驿站送药材。”",
    ],
    choices: [
      {
        id: "hear",
        label: "把话听全",
        effects: [{ t: "custom", fn: (s) => { s.stories.flags["world.escortRumor"] = true; } }],
      },
    ],
  },
  {
    id: "life.townsman",
    title: "同乡求借",
    entry: true,
    priority: 4,
    weight: 6,
    once: true,
    when: (s) => day(s) >= 2 && s.player.money >= 50,
    text: () => ["一个操着乡音的汉子寻过来，说货船压了工钱，家里等米下锅，想借 50 文周转。"],
    choices: [
      {
        id: "lend",
        label: "借他 50 文",
        cost: { money: 50 },
        effects: [{ t: "relation", npc: "ma-foreman", delta: 1 }, { t: "logline", text: "汉子千恩万谢。数日后，托脚行捎回来 80 文和一包干枣。" }],
      },
      { id: "refuse", label: "手头也紧，推脱了", effects: [{ t: "logline", text: "汉子讪讪去了。" }] },
    ],
  },
  {
    id: "life.dog",
    title: "巷口野狗",
    entry: true,
    priority: 5,
    weight: 6,
    cooldownMinutes: 1440,
    when: (s) => ["west-street", "market", "temple"].includes(s.location),
    text: () => ["一条瘸腿野狗拦在巷口，呲着牙，却不真咬，只是不肯让路。"],
    choices: [
      {
        id: "feed",
        label: "掰半张干粮给它",
        cost: { item: { id: "ration", count: 1 } },
        effects: [{ t: "logline", text: "野狗叼着干粮摇了摇尾巴。此后你走这条巷，它都会让路。" }],
      },
      { id: "detour", label: "绕路走", note: "多耗些脚力", effects: [{ t: "stamina", delta: -5 }] },
    ],
  },
  {
    id: "life.rain.shelter",
    title: "暴雨倾盆",
    entry: true,
    priority: 3,
    weight: 20,
    cooldownMinutes: 720,
    when: (s) => s.world.weather === "雨" && ["west-street", "market", "city-gate", "mountain-pass"].includes(s.location),
    text: () => ["雨点砸得青石板直冒白烟，行人抱头乱窜。"],
    choices: [
      { id: "shelter", label: "檐下躲雨", note: "半时辰", minutes: 30, effects: [{ t: "logline", text: "雨幕白茫茫一片，你缩在檐下等它过去。" }] },
      {
        id: "brave",
        label: "冒雨赶路",
        note: "耗体力",
        effects: [{ t: "stamina", delta: -10 }, { t: "logline", text: "你顶着雨走，浑身透湿。" }],
      },
    ],
  },
  {
    id: "life.night.patrol",
    title: "更夫闲话",
    entry: true,
    priority: 4,
    weight: 5,
    cooldownMinutes: 1440,
    when: (s) => isNightMinute(s) && ["inn", "temple", "west-street"].includes(s.location),
    text: () => ["打更的梆子声近了。老更夫提着灯笼踱过来，见你未睡，搭起了话。"],
    choices: [
      {
        id: "chat",
        label: "陪他走一段",
        note: "听些市井门道",
        minutes: 30,
        effects: [{ t: "logline", text: "老更夫指给你哪家铺子缺人手、哪条巷子夜里不太平。" }],
      },
    ],
  },
  {
    id: "life.street.smart",
    title: "武师卖艺",
    entry: true,
    priority: 4,
    weight: 6,
    cooldownMinutes: 2880,
    when: (s) => s.location === "market",
    text: () => ["市口有个耍刀卖艺的汉子，一套刀法虎虎生风，围了一圈人叫好。"],
    choices: [
      {
        id: "watch",
        label: "站定了细看",
        note: "半时辰；武艺微涨",
        minutes: 30,
        effects: [{ t: "skill", delta: 1 }, { t: "logline", text: "看台上的门道，比闷头傻练强些。" }],
      },
    ],
  },
  {
    id: "life.su.task",
    title: "回春药铺 · 招送药伙计",
    entry: true,
    priority: 4,
    weight: 12,
    once: true,
    when: (s) => s.location === "pharmacy" && !flagBool(s, "npc.suTaskTaken"),
    text: () => [
      "苏掌柜拨着算盘：“城里抓药的人多，肯跑腿送药的少。”",
      "“你若愿意帮我把煎好的药送去病家，我按趟记你的好。”",
    ],
    choices: [
      {
        id: "accept",
        label: "应下这差事",
        effects: [
          { t: "custom", fn: (s) => { s.stories.flags["npc.suTaskTaken"] = true; } },
          { t: "logline", text: "苏掌柜点点头：“药包好就来拿。”" },
        ],
      },
    ],
  },
  {
    id: "life.su.deliver",
    title: "回春药铺 · 送药",
    entry: true,
    priority: 4,
    weight: 14,
    cooldownMinutes: 180,
    when: (s) => s.location === "pharmacy" && flagBool(s, "npc.suTaskTaken") && flagNum(s, "npc.suFavors") < 3,
    text: (s) => [`柜上摆着三包煎好的药。苏掌柜头也不抬：“送西街、送码头、送客栈，随你先送哪家。（已送 ${flagNum(s, "npc.suFavors")}/3）`],
    choices: [
      { id: "west", label: "送西街病家", note: "半时辰", minutes: 30, cost: { stamina: 5 }, effects: [{ t: "custom", fn: (s) => { s.stories.flags["npc.suFavors"] = flagNum(s, "npc.suFavors") + 1; } }, { t: "money", delta: 10 }] },
      { id: "wharf", label: "送码头船工", note: "2/3 时辰", minutes: 40, cost: { stamina: 8 }, effects: [{ t: "custom", fn: (s) => { s.stories.flags["npc.suFavors"] = flagNum(s, "npc.suFavors") + 1; } }, { t: "money", delta: 12 }] },
      { id: "inn", label: "送客栈东家", note: "1/3 时辰", minutes: 20, cost: { stamina: 5 }, effects: [{ t: "custom", fn: (s) => { s.stories.flags["npc.suFavors"] = flagNum(s, "npc.suFavors") + 1; } }, { t: "money", delta: 8 }] },
    ],
  },
  {
    id: "life.su.trust",
    title: "回春药铺 · 苏掌柜引荐",
    entry: true,
    priority: 4,
    weight: 15,
    once: true,
    when: (s) => s.location === "pharmacy" && flagNum(s, "npc.suFavors") >= 3 && !hasProof(s, "social", "人情·药铺引荐") && s.role === "游子",
    text: () => [
      "苏掌柜合上算盘，难得露了个笑：“连着这么多趟，一包药都没出过错。”",
      "“照川门驻点的顾执事与我有些往来。你若求入门，我替你写封引荐信。”",
    ],
    choices: [
      {
        id: "accept",
        label: "拜谢收下",
        note: "获得人情证明",
        effects: [
          { t: "proof", kind: "social", id: "人情·药铺引荐" },
          { t: "relation", npc: "su-pharmacist", delta: 1 },
          { t: "logline", text: "【入门证明】人情证明到手：回春药铺苏掌柜引荐。" },
        ],
      },
    ],
  },
  {
    id: "life.ma.trust",
    title: "码头脚行 · 马把头引荐",
    entry: true,
    priority: 4,
    weight: 15,
    once: true,
    when: (s) => s.location === "wharf" && flagNum(s, "npc.maShifts") >= 3 && !hasProof(s, "social", "人情·脚行引荐") && s.role === "游子",
    text: () => [
      "马把头把烟杆在鞋底磕了磕：“连着扛了这些天，从不偷奸耍滑。”",
      "“顾执事前几日还问我有没有可靠的后生。我马某人替你递句话。”",
    ],
    choices: [
      {
        id: "accept",
        label: "抱拳道谢",
        note: "获得人情证明",
        effects: [
          { t: "proof", kind: "social", id: "人情·脚行引荐" },
          { t: "relation", npc: "ma-foreman", delta: 1 },
          { t: "logline", text: "【入门证明】人情证明到手：码头脚行马把头引荐。" },
        ],
      },
    ],
  },
  {
    id: "wharf.night.guard",
    title: "码头 · 夜半泼皮",
    entry: true,
    priority: 4,
    weight: 10,
    cooldownMinutes: 1440,
    when: (s) => s.location === "wharf" && isNightMinute(s) && !hasProof(s, "martial", "武艺·码头护货") && s.role === "游子",
    text: () => [
      "几个泼皮摸黑上了趸船，见货就掀。守夜的老更夫急得直喊。",
      "马把头不在，脚行的伙计们腿肚子直转筋。",
    ],
    choices: [
      {
        id: "fight",
        label: "上前打退泼皮",
        note: "动手；胜则得武艺证明",
        minutes: 30,
        effects: [{ t: "custom", fn: (s) => { startWharfFight(s); } }],
      },
      { id: "watch", label: "躲在暗处记下嘴脸", effects: [{ t: "logline", text: "你记下为首那人的疤脸。明日报与马把头，他骂骂咧咧加了巡夜。" }] },
    ],
  },
  {
    id: "wharf.night.guard.after",
    title: "码头 · 打退泼皮",
    entry: false,
    priority: 4,
    weight: 1,
    text: () => ["泼皮们抱头鼠窜。马把头闻讯赶来，拍着你肩膀哈哈大笑。"],
    choices: [
      {
        id: "accept",
        label: "抱拳称不敢当",
        note: "获得武艺证明",
        effects: [
          { t: "proof", kind: "martial", id: "武艺·码头护货" },
          { t: "relation", npc: "ma-foreman", delta: 2 },
          { t: "logline", text: "【入门证明】武艺证明到手：夜护码头货栈。" },
        ],
      },
    ],
  },

  /* ================ 门派：考核 / 担保 / 债务催收 ================ */
  {
    id: "sect.exam",
    title: "照川门 · 考校",
    entry: false,
    priority: 2,
    weight: 1,
    onEnter: [{ tag: "考校", attr: "arm", label: "武艺考校", difficulty: 50 }],
    text: (s, checks) => {
      const good = checks["考校"] && checks["考校"].band !== "失败" && checks["考校"].band !== "大失败";
      const proofs = [
        ...s.world.proofs.martial.map((x) => `武艺·${x}`),
        ...s.world.proofs.social.map((x) => `人情·${x}`),
        ...s.world.proofs.virtue.map((x) => `品行·${x}`),
      ];
      return [
        "顾执事端坐堂上，逐一核验你呈上的证明文书。",
        `“${proofs.join("、")}。”他念罢，抬眼打量你，“证明是真的，人我还得看看。”`,
        good
          ? "你依着平日所练走了一趟拳脚，顾执事微微颔首。"
          : "你紧张之下走了样，但收势还算稳当。顾执事不置可否。",
        "“证明齐备，考核过了。自今日起，你是照川门的候选学徒。门中有一桩差事，正要寻人。”",
      ];
    },
    choices: [
      {
        id: "accept",
        label: "行礼受训",
        note: "成为候选学徒（考校要求基本武艺 ≥50）",
        minutes: 30,
        when: (s) => (s.player.martialSkill >= 50 ? null : `考校要求基本武艺 ≥50，当前 ${s.player.martialSkill}`),
        effects: [
          { t: "role", role: "候选学徒" },
          { t: "custom", fn: (s) => { s.world.exam.signedUp = true; s.world.exam.result = "通过"; } },
          { t: "trust", delta: 1 },
          { t: "logline", text: "【身份】照川门候选学徒（考核通过）。" },
        ],
      },
      {
        id: "defer",
        label: "拱手告退，回去苦练",
        note: "证明已核验，考校另择日",
        effects: [{ t: "logline", text: "顾执事颔首：“证明我留下了。武艺练足五十，随时来考。”" }],
      },
    ],
  },
  {
    id: "sect.guarantee",
    title: "照川门 · 执事担保",
    entry: true,
    priority: 2,
    weight: 10,
    once: true,
    when: (s) => flagBool(s, "sect.guaranteePending") && s.role === "游子",
    text: () => [
      "考核之期已到，你的证明还差着。顾执事沉吟半晌。",
      "“照川门收人不拘一格。我以执事身份担保你入门，先做候选学徒——只是门里的眼睛都盯着，你头一桩差事，办砸了谁也护不住你。”",
    ],
    choices: [
      {
        id: "accept",
        label: "叩谢担保之恩",
        note: "初始信任降低；任务评价条件更严",
        minutes: 30,
        effects: [
          { t: "role", role: "候选学徒" },
          { t: "custom", fn: (s) => { s.world.exam.guaranteed = true; s.world.exam.result = "担保"; s.stories.flags["sect.guaranteePending"] = false; } },
          { t: "trust", delta: -2 },
          { t: "logline", text: "【身份】照川门候选学徒（执事担保，观察期）。" },
        ],
      },
    ],
  },
  {
    id: "inn.debt.collect",
    title: "客栈 · 催账",
    entry: true,
    priority: 2,
    weight: 10,
    cooldownMinutes: 720,
    when: (s) => flagBool(s, "life.debtDefaulted") && s.player.debt > 0 && s.location === "inn",
    text: (s) => [
      `白掌柜把账本拍在柜上：“客官，${s.player.debt} 文的赊账早过了期限，利钱也照规矩加了。”`,
      "“不是逼你。可这账再拖下去，往后这县城里，怕是没人敢赊给你一粒米。”",
    ],
    choices: [
      {
        id: "pay",
        label: "倾囊还账",
        note: "还清全部欠款与利息",
        when: (s) => (s.player.money >= s.player.debt ? null : "银钱不够"),
        effects: [
          { t: "custom", fn: (s) => { const d = s.player.debt; s.player.money -= d; s.stats.spent += d; s.player.debt = 0; s.stories.flags["life.debtDefaulted"] = false; } },
          { t: "relation", npc: "bai-innkeeper", delta: 1 },
          { t: "logline", text: "你把沉甸甸的钱袋拍在柜上。白掌柜脸色这才缓过来。" },
        ],
      },
      {
        id: "stall",
        label: "赔笑宽限几日",
        note: "白掌柜不悦",
        effects: [{ t: "relation", npc: "bai-innkeeper", delta: -1 }, { t: "logline", text: "白掌柜冷哼一声，把账本收了回去。" }],
      },
    ],
  },

  /* ================ 武馆切磋（教学战斗入口） ================ */
  {
    id: "school.sparring",
    title: "武馆 · 切磋",
    entry: false,
    priority: 2,
    weight: 1,
    text: () => [
      "铁教头把长凳一横：“空口无凭。赢了我这套看家拳，武馆替你作保。”",
      "点到即止，拳脚无眼——你自己掂量。",
    ],
    choices: [
      {
        id: "fight",
        label: "抱拳应战",
        note: "切磋；胜则得武艺证明",
        effects: [{ t: "custom", fn: (s) => { startSparring(s); } }],
      },
      { id: "defer", label: "改日再讨教", effects: [{ t: "logline", text: "你抱拳退开。铁教头不置可否。" }] },
    ],
  },
];

/* ---------------- 辅助 ---------------- */
function day(s: GameState): number {
  return Math.floor(s.clock.minutes / 1440) + 1;
}

function isNightMinute(s: GameState): boolean {
  const m = s.clock.minutes % 1440;
  return m < 6 * 60 || m >= 20 * 60;
}

/** 切磋/夜战开始的引擎调用由事务层完成：这里仅置标记，事务层读取后 startCombat */
function startSparring(s: GameState): void {
  s.stories.flags["sect.pendingCombat"] = "sparring";
}

function startWharfFight(s: GameState): void {
  s.stories.flags["sect.pendingCombat"] = "wharf";
}

export const PENDING_COMBAT_FLAG = "sect.pendingCombat";
