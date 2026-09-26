<script setup lang="ts">
import { computed, reactive } from "vue";
import { ElMessage } from "element-plus";
import { SHIFTS, fuelByCode } from "../data/fuels";
import { DIFF_LIMIT_PCT, WATER_LIMIT_CM, evaluateEntry } from "../domain/rules";
import type { EntryValues, ShiftName } from "../domain/types";
import { useReleaseStore } from "../stores/releaseStore";
import { fmtLiters, fmtPct } from "./format";

const store = useReleaseStore();

const form = reactive({
  fuelCode: store.fuels[0]?.code ?? "",
  businessDate: new Date().toISOString().slice(0, 10),
  shift: "早班" as ShiftName,
  levelMm: 0,
  waterCm: 0,
  tempC: 20,
  nozzleTotal: 0,
  operator: "",
  note: "",
});

const fuel = computed(() => fuelByCode(form.fuelCode));
const suspended = computed(() => store.isSuspended(form.fuelCode));
const pending = computed(() => store.pendingDisposal(form.fuelCode));
const baseline = computed(() => store.baselineOf(form.fuelCode));
const baselineEntry = computed(() => {
  const id = baseline.value?.entryId;
  return id ? store.entryById(id) : undefined;
});

const values = computed<EntryValues>(() => ({
  businessDate: form.businessDate,
  shift: form.shift,
  levelMm: Number(form.levelMm) || 0,
  waterCm: Number(form.waterCm) || 0,
  tempC: Number(form.tempC) || 0,
  nozzleTotal: Number(form.nozzleTotal) || 0,
  operator: form.operator.trim(),
  note: form.note.trim(),
}));

/** 实时预判定：录入时即看到与上一班衔接后的库存差异 */
const preview = computed(() => evaluateEntry(values.value, fuel.value, baseline.value));
const diffOver = computed(() => Math.abs(preview.value.diffPct) > DIFF_LIMIT_PCT);
const waterOver = computed(() => values.value.waterCm > WATER_LIMIT_CM);

function submit() {
  if (!values.value.operator) {
    ElMessage.error("请填写交班人");
    return;
  }
  const result = store.registerEntry(form.fuelCode, values.value);
  if (!result.ok) {
    ElMessage.error(result.error);
    return;
  }
  const triggers = result.entry?.verdict.triggers ?? [];
  if (triggers.length > 0) {
    ElMessage.warning(`已登记并停发：${triggers.join("；")}，处置单已生成`);
  } else {
    ElMessage.success("交接已登记，判定正常，等待复核");
  }
  Object.assign(form, { levelMm: 0, waterCm: 0, tempC: 20, nozzleTotal: 0, operator: "", note: "" });
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>交接登记（按油品）</h2>

    <div v-if="suspended" class="banner-stop">
      <strong>{{ fuel.name }} 停发中</strong>
      <p>{{ pending?.triggers.join("；") }}。处置单未确认前不能继续登记发油，请先在「处置单」中完成确认。</p>
    </div>

    <div class="form-grid">
      <label>
        油品 / 罐号
        <select v-model="form.fuelCode">
          <option v-for="item in store.fuels" :key="item.code" :value="item.code">
            {{ item.name }}（{{ item.tank.tankNo }}）
          </option>
        </select>
      </label>
      <div class="field-row">
        <label>
          营业日
          <input v-model="form.businessDate" type="date" required />
        </label>
        <label>
          班次
          <select v-model="form.shift">
            <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </label>
      </div>
      <div class="field-row">
        <label>
          液位（mm）
          <input v-model="form.levelMm" type="number" min="0" step="1" required />
        </label>
        <label>
          水高（cm）
          <input v-model="form.waterCm" type="number" min="0" step="0.1" required />
        </label>
      </div>
      <div class="field-row">
        <label>
          温度（°C）
          <input v-model="form.tempC" type="number" step="0.1" required />
        </label>
        <label>
          油枪累计数（L）
          <input v-model="form.nozzleTotal" type="number" min="0" step="1" required />
        </label>
      </div>
      <label>
        交班人
        <input v-model="form.operator" type="text" placeholder="填写交班人姓名" required />
      </label>
      <label>
        备注
        <textarea v-model="form.note" placeholder="填写现场说明，如量油异常、设备检修等" />
      </label>
    </div>

    <div class="preview">
      <h3>库存衔接预览</h3>
      <p v-if="baselineEntry" class="preview-source">
        衔接上一班：{{ fuel.name }} · {{ baselineEntry.values.businessDate }}
        {{ baselineEntry.values.shift }}
      </p>
      <p v-else class="preview-source">首班建账，不与上一班比对差异</p>
      <dl class="preview-grid">
        <div>
          <dt>上班实测库存</dt>
          <dd>{{ baseline ? fmtLiters(baseline.measuredLiters) : "—" }}</dd>
        </div>
        <div>
          <dt>本班油枪走字</dt>
          <dd>{{ baseline ? fmtLiters(preview.salesLiters) : "—" }}</dd>
        </div>
        <div>
          <dt>实测库存（V20）</dt>
          <dd>{{ fmtLiters(preview.v20Measured) }}</dd>
        </div>
        <div>
          <dt>账面库存（V20）</dt>
          <dd>{{ baseline ? fmtLiters(preview.v20Book) : "—" }}</dd>
        </div>
        <div>
          <dt>库存差异</dt>
          <dd :class="{ bad: baseline && diffOver }">{{ baseline ? fmtPct(preview.diffPct) : "—" }}</dd>
        </div>
        <div>
          <dt>水高判定</dt>
          <dd :class="{ bad: waterOver }">
            {{ values.waterCm }}cm / 限值 {{ WATER_LIMIT_CM }}cm
          </dd>
        </div>
      </dl>
      <ul v-if="baseline && preview.triggers.length > 0" class="triggers">
        <li v-for="trigger in preview.triggers" :key="trigger">{{ trigger }}，登记后将停发</li>
      </ul>
    </div>

    <button type="submit" :disabled="suspended">登记交接</button>
  </form>
</template>
