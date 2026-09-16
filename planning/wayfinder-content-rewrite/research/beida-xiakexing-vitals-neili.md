# 北大侠客行：生命值与内力增长、恢复机制

- 研究日期：2026-09-16
- 研究目标：为 Issue #24 的生命值、内力、体力分工提供机制参考
- 证据等级：现行北侠规则优先采用 `pkuxkx.net` 官方域名 Wiki 中标明“修改自游戏 `help faq`”的帮助文本；实现细节采用同源《侠客行一百》公开 mudlib 固定提交 `dfca57e`。后者不是现行北侠服务端源码，只能证明传统侠客行机制如何实现，不能证明北侠当前精确公式。

## 结论

适合本项目借鉴的不是北侠的具体倍率，而是三条关系：

1. **生命值分当前气血与伤势上限**：普通损耗只扣当前值；重伤降低可恢复上限；休息只能把当前值恢复到伤势允许的上限，药物、疗伤、长期休养才修复伤势。公开同源源码分别用 `qi`、`eff_qi`、`max_qi` 表示当前气血、有效气血、永久上限，并将普通恢复与疗伤拆为两个函数。[`hp.c` 56–67](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/usr/hp.c#L56-L67)、[`damage.c` 13–109](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L13-L109)
2. **内力修为反哺生命**：北侠帮助写明最大内力每增加 4 点，气血增加 1 点；同源源码的气血自然恢复量也含 `max_neili / 10`。内力因此既是战斗资源，也是角色长期体魄的来源。[北侠 `help faq` 第 13 项](https://wiki.pkuxkx.net/wiki/help/faq)、[`damage.c` 380–412](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L380-L412)
3. **恢复手段分工**：吃喝维持自然恢复条件；睡眠主要恢复体力与当前气血，只补部分内力；内力上限靠打坐和内功成长；伤势靠药物、疗伤或慢速休养。[`damage.c` 369–423](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L369-L423)、[`sleep.c` 199–237](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/std/sleep.c#L199-L237)、[北侠 `help faq` 第 14、42 项](https://wiki.pkuxkx.net/wiki/help/faq)

这与 Issue #24 已确认的方向一致：日常主要消耗体力；生命值、内力偏战斗；睡眠不把三条资源同时回满。

## 证据范围与限制

北侠当前服务端源码未公开。可核实的一手或近一手材料只有两层：

- **北侠游戏规则**：北侠官方域名 Wiki 的 [`help:faq`](https://wiki.pkuxkx.net/wiki/help/faq) 明确标注“本页面修改自游戏 `help faq`”；它能支持现行概念、成长关系和命令行为。Wiki 其他攻略页属于玩家维护材料，仅作交叉验证，不用来断言精确公式。
- **底层实现**：[`MudRen/xkx100`](https://github.com/MudRen/xkx100/tree/dfca57e056460d7c0532a6e19a5e4add94a5588d) 是公开《侠客行一百》mudlib，与北侠同源但不是同一服务端。它能解释 `qi / eff_qi / max_qi`、打坐、睡眠、饥渴、昏迷等传统机制的代码结构；数值与现代北侠可能已分叉。

因此，以下内容把“北侠帮助明确说明”和“同源源码实现参考”分开陈述。

## 概念对照

| 北侠/同源源码概念 | 含义 | 本项目建议映射 | 证据 |
|---|---|---|---|
| `qi`，当前气血 | 战斗中即时承伤与恢复的值 | `生命值` | [`hp.c` 63–67](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/usr/hp.c#L63-L67) |
| `eff_qi`，有效气血 | 受伤后的临时可恢复上限 | `伤势上限` 或由 `伤势` 推导的可恢复上限 | [`damage.c` 42–68](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L42-L68) |
| `max_qi`，最大气血 | 长期生命上限 | `最大生命值` | [`hp.c` 63–67](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/usr/hp.c#L63-L67) |
| `jing / eff_jing / max_jing` | 精神的当前值、有效上限、永久上限；老源码显示名为“精气”，现代北侠页面常写“精神” | 若项目没有精神战斗，则不必复制 | [`hp.c` 58–62](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/usr/hp.c#L58-L62)、[北侠任务页的状态示例](https://wiki.pkuxkx.net/wiki/task/murong) |
| `jingli / max_jingli` | 精力及其上限，由吐纳体系成长 | 不映射为日常体力；避免“精力/体力”重名混淆 | [`respirate.c` 53–89](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/respirate.c#L53-L89) |
| `neili / max_neili` | 当前内力、最大内力 | `内力 / 最大内力` | [`hp.c` 63–67](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/usr/hp.c#L63-L67) |
| 有效内功等级 | 激发后的内功技能等级；北侠帮助给出的通用算法为“基本武功等级 / 2 + 特殊武功等级” | `内功境界` 或 `有效内功等级`，用于限制内力上限 | [北侠 `help faq` 第 11、15 项](https://wiki.pkuxkx.net/wiki/help/faq) |
| 体力 `tili / max_tili` | 同源源码另有独立体力槽 | 本项目日常与战斗共用的主行动资源 | [`hp.c` 73–84](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/usr/hp.c#L73-L84)、[`damage.c` 415–420](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L415-L420) |

### “有效内力”需纠正

已核实材料中没有独立的“有效内力”资源槽。存在的是：

- 当前内力 `neili`；
- 最大内力 `max_neili`；
- 有效内功等级，即技能等级，不是内力数值。

北侠 Wiki 对武功要求分别写“当前内力”“最大内力”“有效内功等级”，三者不可混用。[北侠日月门派页](https://wiki.pkuxkx.net/wiki/menpai/riyue)、[北侠 `help faq` 第 11、15 项](https://wiki.pkuxkx.net/wiki/help/faq)

## 生命值：增长与恢复

### 长期增长

北侠游戏帮助明确说明：

- 新人 14 岁时精神、气血均为 100；14–30 岁每年增长，精神增量取先天悟性，气血增量取先天根骨；30–60 岁不变；60 岁后逐年减少。[北侠 `help faq` 第 13 项](https://wiki.pkuxkx.net/wiki/help/faq)
- 最大精力每增加 4，精神增加 1；最大内力每增加 4，气血增加 1。[北侠 `help faq` 第 13 项](https://wiki.pkuxkx.net/wiki/help/faq)
- 药铺的金创药恢复“气血上限”，说明当前气血恢复与伤势上限修复是不同治疗职责。[北侠 `help faq` 第 42 项](https://wiki.pkuxkx.net/wiki/help/faq)

由此可抽象为：

```text
先天根骨 + 年龄阶段 + 内力修为
                -> 最大生命值
```

### 普通损耗、重伤与疗伤

同源源码将伤害和创伤分开：

- `receive_damage("qi", n)` 只扣当前气血 `qi`。[`damage.c` 13–40](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L13-L40)
- `receive_wound("qi", n)` 扣有效气血 `eff_qi`，并把当前气血压到新的有效上限。[`damage.c` 42–73](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L42-L73)
- `receive_heal` 只恢复当前气血，不能超过 `eff_qi`；`receive_curing` 才修复 `eff_qi`，且不能超过 `max_qi`。[`damage.c` 75–109](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L75-L109)

恢复因此形成两层节奏：

```text
休息/睡眠/吸气 -> 当前生命回到伤势上限
药物/疗伤/长期休养 -> 伤势上限回到最大生命
```

### 自然恢复

同源源码的 `heal_up()` 先消耗食物和饮水；任一为零时，玩家与宠物停止身体自然恢复。条件满足后，当前气血按“根骨贡献 + 最大内力贡献”恢复；当前气血到达有效上限后，有效气血才以每次 1 点慢慢向永久上限恢复。[`damage.c` 342–398](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L342-L398)

北侠 Wiki 的新人属性说明把现代公式写为“基本恢复量 + 最大内力 / 10 + 医术等级 / 2”；其中基本恢复量受根骨影响。该页是玩家维护说明，不应把公式数字直接当作稳定 API，但它与同源源码中 `con / 3 + max_neili / 10` 的结构一致。[北侠新人礼物页“根骨”](https://wiki.pkuxkx.net/wiki/newbie/gift)、[`damage.c` 380–398](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L380-L398)

### 内力换气血

北侠新手指南说明 `yun recover` 用内力回复气血。[北侠新手指南](https://wiki.pkuxkx.net/wiki/pkuxkx/guide)

同源源码的基础内功 `recover`：最低要求 20 当前内力；按缺失气血与基本内功等级计算消耗，将内力扣除后恢复当前气血；战斗中使用会产生短暂忙乱。[`force/recover.c` 7–35](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/kungfu/skill/force/recover.c#L7-L35)

该机制说明内力是战斗中的“主动续航储备”，不是日常劳作的通用能量。

## 内力：增长与恢复

### 最大内力增长

北侠游戏帮助明确说明：

- `dazuo` / `dz` 增长最大内力；`tuna` 增长最大精力。[北侠 `help faq` 第 14 项](https://wiki.pkuxkx.net/wiki/help/faq)
- 常规打坐可达的最大内力上限 = 当前有效内功等级 × 10；药物等方法虽可越过，但登录时会清除超出部分。[北侠 `help faq` 第 15 项](https://wiki.pkuxkx.net/wiki/help/faq)
- 药物增长快；打坐所得内力精纯度更高。精纯度是北侠后续扩展维度，不等同当前内力或最大内力。[北侠 `help faq` 第 14 项](https://wiki.pkuxkx.net/wiki/help/faq)

同源源码揭示传统打坐循环：

1. 战斗中不能打坐，且必须先激发内功；开始时要求当前气血足以支付所选消耗、精神至少为最大精神的 70%。[`exercise.c` 23–51](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/exercise.c#L23-L51)
2. 打坐逐轮把当前气血转成当前内力，速度受基本内功等级影响。[`exercise.c` 56–90](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/exercise.c#L56-L90)
3. 当前内力达到最大内力的 2 倍后，最大内力小幅增加，当前内力重置到最大内力；最大内力超过基本内功 × 10 时遇到瓶颈。[`exercise.c` 92–109](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/exercise.c#L92-L109)
4. 中断时，临时蓄积的当前内力最多保留到最大内力的 2 倍。[`exercise.c` 112–118](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/exercise.c#L112-L118)

可抽象为：

```text
内功等级 -> 最大内力成长天花板
打坐投入 -> 当前内力蓄积 -> 最大内力缓慢增长
```

### 当前内力恢复

同源源码中，食物与饮水不为零时，当前内力会按基本内功与体质自然恢复，但最多恢复到最大内力。[`damage.c` 369–378、407–412](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L369-L412)

睡眠不会把内力直接回满：完整睡眠将当前内力向最大内力补一半；短期重复睡眠只补缺口的四分之一。[`sleep.c` 199–225](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/std/sleep.c#L199-L225)

```text
完整睡眠后内力 = 当前内力 + (最大内力 - 当前内力) / 2
重复睡眠后内力 = 当前内力 + (最大内力 - 当前内力) / 4
```

北侠玩家任务页也把“睡觉”作为内力耗尽后的补充手段，但把战斗自救绑定在 `yun recover` 和当前内力上；这支持“睡眠补充、调息/打坐主导”的分工，不支持“一觉回满”。[北侠慕容任务页](https://wiki.pkuxkx.net/wiki/task/murong)

## 吐纳、精神与精力

吐纳是打坐的镜像系统，不等同本项目的日常体力：

- 战斗中不能吐纳；当前气血低于最大气血的 70% 时不能开始；吐纳消耗当前精神，增加当前精力。[`respirate.c` 27–49、53–67](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/respirate.c#L27-L67)
- 当前精力达到最大精力的 2 倍后，最大精力 +1；最大精力受道学等级 × 10 限制。[`respirate.c` 69–89](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/skill/respirate.c#L69-L89)
- 北侠帮助也确认吐纳增长最大精力，常规上限为当前有效内功等级 × 10。[北侠 `help faq` 第 14–15 项](https://wiki.pkuxkx.net/wiki/help/faq)

本项目已决定日常主要使用“体力”，没有必要再复制北侠“精神—精力”双资源。可以只借用“练功有状态门槛、长期修为由主动练功增长”的结构。

## 食物、饮水与睡眠

- 同源源码中的吃、喝只增加 `food`、`water`，不直接恢复气血。[`eat.c` 25–41](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/std/eat.c#L25-L41)、[`drink.c` 17–40](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/std/drink.c#L17-L40)
- 食物或饮水见底会停止气血、内力、体力等自然恢复。[`damage.c` 369–378](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L369-L378)
- 完整睡眠把当前气血恢复到有效气血、把体力恢复到最大值、把当前内力向最大内力补一半；它不修复 `eff_qi` 与 `max_qi` 之间的伤势。[`sleep.c` 218–229](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/std/sleep.c#L218-L229)
- 短期重复睡眠效果衰减，防止连续睡觉无限高效恢复。[`sleep.c` 205–217](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/cmds/std/sleep.c#L205-L217)

本项目可把食物简化为“恢复效率/恢复资格”，而非直接回血物；睡眠主恢复体力和当前生命，内力只部分恢复，伤势仍需疗伤。

## 昏迷与死亡

同源源码采用两级失败：

- 有效气血或有效精神低于 0，直接死亡。[`char.c` 59–73](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/inherit/char/char.c#L59-L73)
- 当前气血或当前精神低于 0，清除敌对关系；正常活动者昏迷，已经失去活动能力者死亡。[`char.c` 75–83](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/inherit/char/char.c#L75-L83)
- 昏迷会把当前气血与精神归零、禁止行动，并在一段受根骨影响的时间后苏醒。[`damage.c` 111–171](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L111-L171)
- 死亡会生成尸体、把当前与有效气血/精神置为 1，并进入鬼魂/死亡流程。[`damage.c` 173–327](https://github.com/MudRen/xkx100/blob/dfca57e056460d7c0532a6e19a5e4add94a5588d/feature/damage.c#L173-L327)

可借鉴“当前生命耗尽先进入濒死/昏迷，伤势上限耗尽或昏迷中继续受创才死亡”，但不必复制鬼魂、尸体、随机昏迷时长。

## 对本项目的取舍

| 机制 | 建议 | 理由 |
|---|---|---|
| 当前生命、伤势上限、最大生命三层 | **借鉴但改名** | 能区分战斗损耗与重伤；UI 可只显示生命条 + 伤势标记，避免暴露三组数字。 |
| 最大内力反哺最大生命/生命恢复 | **借鉴，弱耦合** | 保留内功使人强健的武侠语义；避免内力成为生命成长的唯一途径。 |
| 打坐增加最大内力，受内功境界限制 | **借鉴** | 成长行为、技能前置、资源上限形成闭环。 |
| 打坐消耗当前气血 | **不照搬** | 与“生命值偏战斗、日常主要用体力”冲突；改成消耗体力与时间，重伤时降效率或禁止。 |
| 当前内力可蓄到最大值 2 倍 | **暂不采用** | 引入“超额当前值”会增加 UI 与平衡负担；若以后需要战前运功，可作为技能效果单独设计。 |
| 内力精纯度 | **暂不采用** | 它是现代北侠的进阶成长轴；早期系统加入会让“当前/最大/纯度/境界”过载。 |
| 内力换当前生命 | **借鉴** | 适合作为战斗中“运功疗伤/调息”，体现内力的战斗属性；只恢复当前生命，不修复伤势。 |
| 食物、饮水是自然恢复条件 | **简化借鉴** | 食物不必直接回血；可提供恢复倍率或防止休息失效。饮水若没有独立玩法则不必单列。 |
| 睡眠回满体力、当前生命，部分恢复内力 | **借鉴** | 与已确认的恢复职责一致；伤势不应被普通睡眠清除。 |
| 重复睡眠收益递减 | **按时间系统决定** | 若一天只能睡一次，无需额外惩罚；若可反复休息，需要递减或时间成本。 |
| 昏迷后再受创死亡 | **借鉴** | 比生命归零立即死亡留出救援、逃生与叙事空间。 |
| 年龄 14–30 增长、60 后衰退 | **不照搬数值** | 适合长期在线 MUD，不一定适合本项目的时间跨度；可保留年龄阶段修正而非逐年结算。 |
| 吐纳—精神—精力镜像系统 | **不采用资源层** | 与本项目体力职责重叠；只保留“吐纳/调息”作为恢复或练功动作。 |

## 建议写入 Issue #24 的规则口径

```text
体力：日常与战斗共用的行动资源。劳作、赶路、练功和战斗消耗；吃饭、休息、睡眠快速恢复。

生命值：偏战斗属性。普通伤害扣当前生命；重伤形成伤势，降低可恢复上限。休息和睡眠只能恢复当前生命，药物、疗伤和长期休养修复伤势。最大生命主要受根骨、成长阶段影响，内力修为提供小幅加成。

内力：偏战斗属性。招式、运功、战斗中调息消耗。打坐/调息恢复当前内力并缓慢增长最大内力；内功境界限制最大内力。睡眠只恢复部分内力。内力可转换为当前生命，但不能直接治愈伤势。

失败状态：当前生命耗尽先进入昏迷/濒死；伤势上限耗尽，或昏迷中继续受创，才进入死亡流程。
```

## 来源清单

- [北大侠客行 MUD 百科：`help faq`](https://wiki.pkuxkx.net/wiki/help/faq)（页面标明修改自游戏内 `help faq`；人物状态、成长、打坐/吐纳、上限、药物）
- [北大侠客行新手指南](https://wiki.pkuxkx.net/wiki/pkuxkx/guide)（`dazuo`、`tuna`、`yun recover`、`yun regenerate` 的当前玩法说明）
- [北大侠客行慕容任务页](https://wiki.pkuxkx.net/wiki/task/murong)（状态显示样例、内力上限与战斗自救；玩家维护资料）
- [北大侠客行新人礼物页“根骨”](https://wiki.pkuxkx.net/wiki/newbie/gift)（现代恢复公式的玩家维护说明）
- [北大侠客行日月门派页](https://wiki.pkuxkx.net/wiki/menpai/riyue)（“当前内力 / 最大内力 / 有效内功等级”术语并列实例；玩家维护资料）
- [`MudRen/xkx100` 固定提交 `dfca57e`](https://github.com/MudRen/xkx100/tree/dfca57e056460d7c0532a6e19a5e4add94a5588d)（同源公开 mudlib；具体实现见正文永久链接）
