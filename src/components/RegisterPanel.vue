<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import { useReleaseDeskStore } from "../stores/releaseDesk";
import { PRODUCTS, SHIFTS, productOf } from "../domain/catalog";
import {
  DIFF_LIMIT_PCT,
  deriveReading,
  evaluateReading,
  toPrevRef,
  validateValues,
  WATER_LIMIT_MM,
} from "../domain/rules";
import { fmt, fmtPct } from "../utils/format";
import type { ShiftLabel } from "../domain/types";

const store = useReleaseDeskStore();

const form = reactive({
  productCode: PRODUCTS[0].code,
  date: new Date().toISOString().slice(0, 10),
  shift: "早班" as ShiftLabel,
  levelMm: 0,
  waterMm: 0,
  temperatureC: 20,
  pumpTotalL: 0,
  openingStockL: 0,
  notes: "",
});

const product = computed(() => productOf(form.productCode));
const prev = computed(() => store.latestReading(form.productCode));
const blockedOrder = computed(() => store.openOrderFor(form.productCode));

watch(
  () => form.productCode,
  () => {
    form.pumpTotalL = prev.value ? prev.value.values.pumpTotalL : 0;
  },
  { immediate: true }
);

const values = computed(() => ({
  levelMm: Number(form.levelMm),
  waterMm: Number(form.waterMm),
  temperatureC: Number(form.temperatureC),
  pumpTotalL: Number(form.pumpTotalL),
}));

const preview = computed(() => {
  const invalid = validateValues(values.value);
  const derived = deriveReading(
    product.value,
    values.value,
    prev.value ? toPrevRef(prev.value) : null,
    prev.value ? null : Number(form.openingStockL)
  );
  const alarms = invalid ? [] : evaluateReading(values.value, derived);
  return { invalid, derived, alarms };
});

function submit() {
  const result = store.registerReading({
    productCode: form.productCode,
    date: form.date,
    shift: form.shift,
    values: values.value,
    openingStockL: prev.value ? null : Number(form.openingStockL),
    notes: form.notes,
  });
  if (!result.ok || !result.reading) {
    ElMessage.error(result.error ?? "登记失败");
    return;
  }
  const reading = result.reading;
  if (reading.alarms.length > 0) {
    ElMessage.warning(
      `已登记：${reading.alarms.map((alarm) => alarm.message).join("；")}，该油品已停发并生成处置单`
    );
  } else {
    ElMessage.success("交接登记完成，判定正常放行");
  }
  form.levelMm = 0;
  form.waterMm = 0;
  form.notes = "";
  form.pumpTotalL = reading.values.pumpTotalL;
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>班次交接登记</h2>

    <el-alert
      v-if="blockedOrder"
      type="error"
      :closable="false"
      class="block-alert"
      title="该油品已停发"
      :description="`处置单 #${blockedOrder.id.slice(0, 8)} 尚未确认，停止记录确认前不能继续发油、不能登记新班次。`"
    />

    <div class="form-grid">
      <label>
        油品 / 罐号
        <select v-model="form.productCode">
          <option v-for="item in PRODUCTS" :key="item.code" :value="item.code">
            {{ item.name }}（{{ item.tankNo }}）
          </option>
        </select>
      </label>

      <div class="form-row">
        <label>班次日期 <input v-model="form.date" type="date" required /></label>
        <label>
          班次
          <select v-model="form.shift">
            <option v-for="item in SHIFTS" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
      </div>

      <div v-if="prev" class="prev-box">
        <span>
          上一班：{{ prev.date }} {{ prev.shift }} · 油枪累计
          {{ fmt(prev.values.pumpTotalL, 0) }} L
        </span>
        <span>
          上班实测标准库存 {{ fmt(prev.derived.standardVolumeL, 1) }} L，本班按油枪增量衔接账面库存
        </span>
      </div>
      <div v-else class="prev-box">该油品首班登记，需填写开盘库存（20℃标准体积）。</div>

      <div class="form-row">
        <label>液位 mm <input v-model.number="form.levelMm" type="number" min="0" required /></label>
        <label>水高 mm <input v-model.number="form.waterMm" type="number" min="0" required /></label>
      </div>
      <div class="form-row">
        <label>温度 ℃
          <input v-model.number="form.temperatureC" type="number" step="0.1" required />
        </label>
        <label>油枪累计数 L
          <input v-model.number="form.pumpTotalL" type="number" min="0" required />
        </label>
      </div>

      <label v-if="!prev">
        开盘库存 L（20℃标准体积）
        <input v-model.number="form.openingStockL" type="number" min="0" required />
      </label>

      <div class="preview-box">
        <strong>
          判定预览（V20 = 表载体积 × [1 - β × (t - 20)]，β = {{ product.beta }}）
        </strong>
        <span>
          净油高 {{ fmt(preview.derived.oilHeightMm, 0) }} mm · 表载体积
          {{ fmt(preview.derived.volumeL, 0) }} L · VCF {{ preview.derived.vcf.toFixed(4) }}
        </span>
        <span>
          标准体积 {{ fmt(preview.derived.standardVolumeL, 1) }} L · 账面库存
          {{ fmt(preview.derived.bookStockL, 1) }} L
        </span>
        <span>
          库存盈亏 {{ fmt(preview.derived.diffL, 1) }} L（{{ fmtPct(preview.derived.diffPct) }}）；
          限值 水高 {{ WATER_LIMIT_MM }}mm / 差异 ±{{ DIFF_LIMIT_PCT }}%
        </span>
        <span v-if="preview.invalid" class="muted">{{ preview.invalid }}</span>
      </div>

      <el-alert
        v-if="preview.alarms.length > 0"
        type="warning"
        :closable="false"
        title="保存后将停发该油品并生成处置单"
        :description="preview.alarms.map((alarm) => alarm.message).join('；')"
      />

      <label>
        备注
        <textarea v-model="form.notes" placeholder="填写处理说明或现场备注" />
      </label>

      <button type="submit" :disabled="!!blockedOrder">保存交接并判定放行</button>
    </div>
  </form>
</template>
