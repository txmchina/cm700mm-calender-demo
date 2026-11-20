# CM-700MM 多辊干法制膜设备 — 3D 精密建模与离线交互演示 (v2)

基于实机演示视频《多辊制膜设备（压缩版）.mp4》1:1 比例逆向建模的 **CM-700MM 多辊干法极片制膜设备（700mm 有效幅宽）** 三维参数化工程与 **100% 离线 WebGL 实时交互展示系统**。

## v2 工程升级亮点

1. **单一数据源统一配置 (`specs/machine_config.json`)**：Blender Python 建模管线与 Three.js 前端共享同一份 JSON 规格书（辊组坐标/半径/旋向、机架尺寸、相机预设、13 组子系统参数），彻底消除双端参数漂移；内置 `verify_geometry()` 自动几何质检（实测料带-辊面最小间隙 `+3.34 mm`，零穿模）及 `--preview` 快速预览与 Apple Metal GPU Cycles 支持。
2. **程序化工业 PBR 贴图与精细 UV**：新增 `blender/cm700_textures.py` 生成拉丝不锈钢法线/粗糙度、轴承盖 CNC 车削同心圆纹法线/粗糙度、碳电极膜微粒粗糙度以及暗色 SCADA HMI 触摸屏 UI，配合三向盒式 UV（拉丝）、极坐标圆盘 UV（车削环纹）、平面 UV（HMI 屏与副操作台屏幕）及真实 `DIN Alternate Bold` 工业三维倒角字体 `CM-700MM`。
3. **双层物理落地接触阴影（Contact Shadow / AO）**：直接基于 Blender 世界坐标底座几何自动烘焙 `assets/contact_shadow_static.png`（静置机架/爬梯/辅机）与 `assets/contact_shadow_cutaway.png`（前置可移防护罩与 C 型收卷前护板），在 WebGL 开盖剖视模式下前景阴影随前罩同步平移淡出，无残留“鬼影”。
4. **100% 本地离线引擎 + Draco 几何压缩**：内置本地 `vendor/` Three.js r147 + `GLTFLoader` + `DRACOLoader` + WASM 解码器（0 外链 CDN 请求）；GLB 启用 Draco 压缩（网格几何压缩率 **6.3×–7.4×**），在完整内嵌 6 张 PBR 贴图与 41,403 面精密网格后整包仅 **1.61 MB**。

## 交付物清单

- **统一参数配置**：`specs/machine_config.json`（Blender 与前端共享唯一数据源）
- **Blender 工程源文件**：`blender/cm700mm_calender.blend`（6.22 MB，含打包 PBR 贴图、集合分组、影棚灯光与相机）
- **Draco 压缩通用 3D 资产 (glTF Binary)**：`assets/cm700mm_calender.glb`（1.61 MB，32 个网格对象 / 41,403 面，13 个结构子系统，含完整 PBR 贴图与 `extras` 运动学元数据）
- **程序化 PBR 贴图集**：`assets/textures/`（拉丝不锈钢、CNC 车削环纹、碳极片微粒、SCADA HMI 界面）
- **双层烘焙接触阴影贴图**：`assets/contact_shadow_static.png` & `assets/contact_shadow_cutaway.png`
- **精确料带路径数据**：`assets/web_centerline.json`（圆-圆公切线算法求解的 390 点 700mm 极片中心线，总长 5.977 m）
- **Cycles 影棚验证渲染图（1280×720）**：
  - `renders/01_overview.png` — 整机 3/4 外观总览
  - `renders/02_cutaway.png` — 前罩开启多辊剖视视角
  - `renders/03_rollers_closeup.png` — 五辊压延主机与 S 型导辊微距特写
  - `renders/04_rear_34.png` — 背面 3/4 视角（后置传动箱、电控柜与上料平台）
- **本地离线 WebGL 引擎与交互页**：
  - `website.html` + `website.css` + `js/website-scene.js` — **场景一：官方产品展示页**（无滚轮劫持 5 章节滚动叙事 Scrollytelling、浅色影棚无缝融底、按需开启 360° 自由探索与 5 处空间热点）
  - `index.html` + `styles.css` + `js/app-scene.js` — **工程师全参数剖切检视版**（13 组部件目录树、爆炸拆解、X-Ray 透视、13 秒视频同款演示）
  - `vendor/` — 本地离线 Three.js r147 + GLTFLoader + DRACOLoader + WASM 解码器

## 核心建模结构（13 个工程子系统）

1. **五辊精密压延主机 (`calender_rolls`)**：R1–R5 阶梯直径硬化镜面压延辊（CNC 车削同心纹轴承压盖、内六角螺栓、多级镀铬轴颈）与 2 根上部重型拉杆。
2. **多级张力与测厚导辊组 (`guide_rollers`)**：G1–G9 S 型多级导辊群（剥离辊、过渡辊、水平激光测厚桥 G6–G7、浮动张力摆辊 G8）。
3. **精密收卷机构 (`winder_unit`)**：入卷导辊 G10 与 C 型开口气胀收卷轴 W1。
4. **700mm 干法极片料带与供粉区 (`electrode_web`)**：全路径无穿模精确相切碳极片料带、青白工艺流光边缘、顶部半透明供粉盒与悬浮粉体粒子。
5. **不锈钢供料料斗与定量布料台 (`powder_hopper`)**：深色龙门塔架、SUS316L 圆柱-圆锥抛光料斗及悬臂式滑轨定量布料台。
6. **CM-700MM 前置移动防护罩 (`front_enclosure`)**：双竖向观察窗、真实 `DIN Alternate Bold` 三维立体 `CM-700MM` 铭牌及 C 型收卷前护板（支持剖视平移开启与阴影同步联动）。
7. **悬臂式 HMI 触摸控制箱 (`hmi_pendant`)**：顶部白色方管悬臂龙门、SCADA 图形触控屏、两侧镀铬护手、三色按钮与急停开关。
8. **重型后置机架与传动箱 (`main_frame`)**：后置整体拉丝主墙板、双竖向视窗传动箱、背面百叶检修门与下置机架底座。
9. **金色工业安全登高梯台 (`safety_stairs`)**：6 级防滑踏步、底部斜撑桁架、双侧扶手与平台 U 型圆弧安全护栏门。
10. **上料检修平台与辅机框架 (`feeding_platform`)**：高位拉丝平台、六柱方管支撑架、平台配料箱及底部带脚轮抽拉辅机。
11. **收卷侧置操作台 (`control_desk`)**：30° 白色斜面控制面板（3×3 红绿带灯按钮 + 急停）及带 SCADA 界面的后置副监测屏。
12. **模温与液压循环辅机柜 (`aux_thermal_unit`)**：三扇圆角深色观察窗、镀铬门锁及 6 列冲压百叶散热格栅。
13. **主电控与 PLC 配电柜 (`electrical_cabinet`)**：双联高大立式不锈钢电控柜与桥架线槽。

## 使用方法

### 1. 离线启动浏览器实时 3D 交互展示
在项目目录下运行任意本地静态 HTTP 服务器（全程 **0 外部网络依赖**）：

```bash
cd /Users/huiyang/Desktop/Google/cm700mm-calender-demo
python3 -m http.server 8095
```

打开 `http://localhost:8095` 即可体验：
- **🎬 视频同款演示**：一键重现原视频 13 秒运镜 + 前罩与落地阴影同步开盖 + 16 辊物理同步运转；
- **观察模式切换**：实体外观 / 开盖剖视 / 透视 X-Ray / 爆炸拆解滑块；
- **物理同步运动**：调节线速度（2–60 m/min），16 根辊轴按 $\omega_i = \pm v / R_i$ 实时同步对旋；
- **点击任意部件**：高亮并查看工程原理、关键参数与材料，支持聚焦、单独看、隐藏。

### 2. 重新从脚本构建模型与渲染图

- **完整高清构建（1280×720 Cycles + Draco GLB + 贴图与接触阴影）**：
  ```bash
  /usr/local/bin/blender -b --factory-startup --python /Users/huiyang/Desktop/Google/cm700mm-calender-demo/blender/build_cm700_all.py
  ```
- **快速迭代预览模式（640×360 @ 12 samples，~25 秒完成全套构建+4图）**：
  ```bash
  /usr/local/bin/blender -b --factory-startup --python /Users/huiyang/Desktop/Google/cm700mm-calender-demo/blender/build_cm700_all.py -- --preview
  ```
- **仅重渲单个机位或跳过渲染**：支持 `--only 03_rollers_closeup` 或 `--skip-renders`。
