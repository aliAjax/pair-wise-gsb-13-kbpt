# 加油站油品放行台

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Pinia、Element Plus
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

在原班次交接页上扩展为油品放行台，数据默认保存在浏览器 localStorage 中，重开页面后仍可按油品查看停发记录、待处置单和更正版本。

## 放行规则

- 按油品登记罐号、液位、水高、温度、油枪累计数；首班登记开盘库存，后续班次自动与上一班实测标准库存衔接（账面库存 = 上班 V20 库存 - 本班油枪付油量）。
- 温度密度换算：`V20 = (液位 - 水高) × 罐容系数 × [1 - β × (t - 20)]`。
- 水高 > 50mm（5cm），或换算后库存差异 > ±0.8% 时，该油品先停发并自动生成处置单。
- 处置单登记抽水回罐量、复测值和复核人，且复测水高回到限值内，确认后才恢复发油；未确认前不能登记新班次。
- 班次复核后冻结；补充更正必须填写原因，旧值另存为版本保留在「版本经历」中。

## 目录结构（数据 / 判定 / 存储 / 页面分离）

```
src/domain/types.ts     数据模型
src/domain/catalog.ts   油品与罐配置
src/domain/rules.ts     温度密度换算、限值判定（纯函数）
src/data/storage.ts     localStorage 读写与种子数据
src/stores/releaseDesk.ts  Pinia 数据层与业务动作
src/components/         登记面板、记录卡、处置单、版本经历
src/App.vue             页面组装
```
