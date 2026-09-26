# 加油站油品放行台

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Element Plus、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

在班次交接基础上升级为油品放行台：按油品登记罐号、液位、水高、温度与油枪累计数，
自动衔接上一班实测库存；水高超过 5cm 或按温度换算（V20）后库存差异超过 ±0.8% 即停发并生成处置单，
登记抽水回罐量、复测值与复核人确认后才恢复发油。已复核班次冻结，补充更正带原因另存版本并保留旧值。

## 目录结构（数据 / 判定 / 存储 / 页面分层）

- `src/domain/types.ts`：油品、班次记录、判定结果、处置单、更正版本等实体类型
- `src/domain/rules.ts`：判定逻辑——卧罐液位容积换算、V20 温度换算、库存差异率、停发触发与处置确认校验
- `src/data/fuels.ts`：油品与罐号档案、班次选项、演示种子数据
- `src/storage/repository.ts`：localStorage 读写与重置（键名 `dfwlfront-7-release`）
- `src/stores/releaseStore.ts`：Pinia 状态层，登记 / 复核 / 更正 / 处置确认等动作
- `src/components/`：页面组件（放行状态卡、登记表单、班次记录、处置单、版本经历）

数据默认保存在浏览器 localStorage 中，重开后仍可按油品查看停发状态、待处置单与版本经历。
