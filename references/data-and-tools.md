# 数据与工具

辅助工具不自动生成固定相册：导演决策、实际看片、歌词核实和最终听感仍由制作流程完成。示例路径均为占位，替换为当前项目。

## 运行条件

Python 3.10+；清单/参考序列需要 Pillow，音乐分析需要 NumPy；媒体命令需要 FFmpeg/FFprobe。先检查现有运行时，可通过 `--ffmpeg`/`--ffprobe` 提供实际可执行文件路径，不要求重装。Canvas 模块需要现代浏览器 2D Canvas。

建议把 `project.md`、`PROGRESS.md`、`catalog.json`、`music-map.json`、`timeline.json`、`lyrics.json` 与 `versions/`、`analysis/`、`outputs/` 放在工作目录。现有工程有等价结构时保留，不强制迁移。

## 重新扫描素材

```powershell
python <skill>/scripts/media_inventory.py <照片目录> <婚纱照目录> --out <project>/catalog.json
python <skill>/scripts/media_inventory.py <照片目录> <婚纱照目录> --previous <project>/catalog.json --overrides <project>/overrides.json --out <project>/catalog-next.json
```

首次产生随机稳定 ID，后续必须给 `--previous`。脚本不计算哈希；同大小失踪文件仅列为未核实的改名候选。确认后使用映射：

```json
{
  "renames": {"/absolute/new-photo.jpg": "Mexistingid"},
  "exclude": {"Mremovedid": "用户要求排除该事件"}
}
```

`exclude` 接受 ID 或当前绝对路径。已排除项自动继承；明确重新授权后可用值 `null` 清除。路径映射必须指向上一清单的 ID，同 ID 映射两个当前文件会报错。

输出包含 `items`、`missing_previous`、`rename_candidates`、`ignored_extensions`。`probe_error` 不等于无用，应检查解码支持；未识别扩展名也要看一遍。脚本不扫描自身输出目录，要求输出位于所有源目录外部。

## 音乐候选图

```powershell
python <skill>/scripts/music_map.py <song.flac> --out <project>/music-candidates.json --fps 30
python <skill>/scripts/music_map.py <song.flac> --trim <确认的裁切秒数> --out <project>/music-map.json --fps 30
```

`--trim` 是已确认的源起点，不由脚本自动应用到歌曲文件。输出 `leading_sound_candidate` 是原歌曲上的粗略首声音时间；`attacks.time` 是减偏移后的成片时间，`source_time` 保留原时间。候选全部 `verified:false`。脚本使用约10ms步长，周期估计是初筛，不能据此宣称已完成精确卡点。

在项目另存人工核实后的乐段、拍点与事件：

```json
{
  "source_trim_start": 0,
  "sections": [{"start": 0, "end": 8, "role": "intro", "verified": true}],
  "events": [{"time": 2.0, "type": "photo_landed", "music_anchor": "verified_attack", "frame": 60}],
  "lyrics": [{"start": 3.1, "end": 6.2, "text": "实际核实的歌词", "verified": true}]
}
```

## 参考片连续序列

```powershell
python <skill>/scripts/reference_strip.py <reference.mp4> --start 10 --duration 6 --sample-fps 6 --out <project>/analysis/reference-a
```

生成保留声音的 `motion.mp4`、连续采样帧和每页最多24帧的联系表。单段最长30秒、最多240样本；更长段分开。联系表标签是重新采样后的近似源时间，不能当原片 VFR 每帧 PTS。正常播放视频理解运动，联系表辅助拆解。

## 声明覆盖与成片证据

时间轴的最小检查格式：

```json
{
  "duration": 8.0,
  "fps": 30,
  "placements": [
    {"id": "Mexistingid", "start": 0, "visible_start": 0.4, "visible_end": 7.7, "end": 8}
  ]
}
```

```powershell
python <skill>/scripts/audit_delivery.py --catalog <project>/catalog.json --timeline <project>/timeline.json --out <project>/analysis/coverage --min-visible 2.5
python <skill>/scripts/audit_delivery.py --catalog <project>/catalog.json --timeline <project>/timeline.json --video <final.mp4> --proofs --out <project>/analysis/final
```

脚本检查缺失/排除/未知 ID、时间合法性、连续完整曝光、声明中的叙事空隙。`--min-visible` 是项目判断阈值，默认2秒仅用于提醒。空隙可能是有意标题或过渡，应查看，不能自动判错或自动填满。

有 `--video` 时探测实际媒体、完整解码、核对时长及音视频流。有 `--proofs` 时按各素材最长曝光的中点，从最终视频取帧，生成 HTML 点击定位索引和 CSV。多项共享同一时间只取一帧。大项目可改为一次顺序解码来提速。

退出码2表示技术/声明错误，0也仍需视觉核对；短曝光等警告在 `report.json`。证明图是整帧，多个小贴片需在工程中增加各自裁切对照。脚本不会声称它认出了正确照片，不代替起/中/末可见性采样或完整动态检查。

HTML 使用本地绝对链接；某些浏览器不允许 file 媒体，从工程已有本地预览服务提供路径或调整 URL，不能为了预览把私人素材上传外站。

## Canvas 特效模块

复制 `assets/canvas-effects.js` 到项目，通过普通 `<script>` 加载，得到 `globalThis.createWeddingEffects`。使用独立透明 canvas 放在素材下方；幕底由工程决定。

```javascript
const fx = createWeddingEffects(document.querySelector('canvas'), {
  width: 1920, height: 1080, // 设计坐标；输出 canvas 可以等比例缩放
  beatPeriod: 0.75,         // 来自当前乐段，不套用本例
  plans: [{
    kind: 'fireworks', start: 10, end: 17,
    anchor: [1100, 400], radius: 150, seed: 3,
    attacks: [11, 14],     // 已确认的绽放时间；留升空与尾迹时间
    blocks: [],           // 整段需要保护的 [x,y,width,height]
    companions: [{anchor: [900, 600], radius: 40, phase: 0}]
  }],
  getProtectedBoxes(t) {
    return currentPhotoActorTitleLyricBounds(t); // 转换到上述设计坐标
  }
});
// 渲染器每次求值都调用；不需要 requestAnimationFrame 或动画累计状态。
fx.draw(currentCompositionTime);
```

可覆盖 `palette.gold/rose/ivory` 的 RGB 数组。十种 `kind` 见美术参考。计划外画布透明；`blocks` 和回调矩形擦除效果以保护素材。它只知道矩形，不知道语义，也不自动搜索位置；设计时检查完整效果轮廓、保护区、字幕与跨切镜头位置。

同一时间重复绘制或倒序定位结果一致。`beatPeriod` 只控制内部动作速度；真正烟花攻击由 `attacks` 指定。变速乐段可使用多个独立实例/计划适配，不把全片平均 BPM 当作逐拍时钟。模块不是人物抠图工具。
