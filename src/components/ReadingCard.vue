<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useReleaseDeskStore } from "../stores/releaseDesk";
import { productOf } from "../domain/catalog";
import { fmt, fmtPct, fmtTime } from "../utils/format";
import type { TankReading } from "../domain/types";

const props = defineProps<{ reading: TankReading }>();
const store = useReleaseDeskStore();

const product = computed(() => productOf(props.reading.productCode));
const hasOrder = computed(() =>
  store.orders.some((order) => order.readingId === props.reading.id)
);

const reviewer = ref("");
const showCorrect = ref(false);
const correct = reactive({
  levelMm: 0,
  waterMm: 0,
  temperatureC: 0,
  pumpTotalL: 0,
  reason: "",
  operator: "",
});

function startCorrect() {
  correct.levelMm = props.reading.values.levelMm;
  correct.waterMm = props.reading.values.waterMm;
  correct.temperatureC = props.reading.values.temperatureC;
  correct.pumpTotalL = props.reading.values.pumpTotalL;
  correct.reason = "";
  correct.operator = "";
  showCorrect.value = true;
}

function submitReview() {
  const result = store.reviewReading(props.reading.id, reviewer.value);
  if (!result.ok) {
    ElMessage.error(result.error ?? "操作失败");
    return;
  }
  ElMessage.success("班次已复核冻结，后续修改需走更正版本");
  reviewer.value = "";
}

function submitCorrect() {
  const result = store.correctReading(
    props.reading.id,
    {
      levelMm: Number(correct.levelMm),
      waterMm: Number(correct.waterMm),
      temperatureC: Number(correct.temperatureC),
      pumpTotalL: Number(correct.pumpTotalL),
    },
    correct.reason,
    correct.operator
  );
  if (!result.ok) {
    ElMessage.error(result.error ?? "操作失败");
    return;
  }
  ElMessage.success("已另存更正版本，旧值保留在版本经历中");
  showCorrect.value = false;
}

function remove() {
  const result = store.removeReading(props.reading.id);
  if (!result.ok) {
    ElMessage.error(result.error ?? "删除失败");
    return;
  }
  ElMessage.success("已删除待复核记录");
}
</script>

<template>
  <article class="record">
    <div class="record-head">
      <p class="record-title">
        {{ product.name }} · {{ reading.date }} {{ reading.shift }}
        <span class="muted">v{{ reading.version }}</span>
      </p>
      <div class="badge-stack">
        <span class="status" :class="reading.releaseStatus === '停发' ? 'status-danger' : ''">
          {{ reading.releaseStatus }}
        </span>
        <span
          class="status"
          :class="reading.reviewStatus === '已复核' ? 'status-muted' : 'status-warn'"
        >
          {{ reading.reviewStatus }}
        </span>
      </div>
    </div>

    <div class="details">
      <span>罐号: {{ product.tankNo }}</span>
      <span>液位: {{ fmt(reading.values.levelMm, 0) }} mm</span>
      <span>水高: {{ fmt(reading.values.waterMm, 0) }} mm</span>
      <span>温度: {{ reading.values.temperatureC.toFixed(1) }} ℃</span>
      <span>油枪累计: {{ fmt(reading.values.pumpTotalL, 0) }} L</span>
      <span>本班付油: {{ fmt(reading.derived.pumpDeltaL, 0) }} L</span>
      <span>标准体积 V20: {{ fmt(reading.derived.standardVolumeL, 1) }} L</span>
      <span>账面库存: {{ fmt(reading.derived.bookStockL, 1) }} L</span>
      <span :class="Math.abs(reading.derived.diffPct) > 0.8 ? 'text-danger' : ''">
        库存盈亏: {{ fmt(reading.derived.diffL, 1) }} L（{{ fmtPct(reading.derived.diffPct) }}）
      </span>
      <span>标准质量: {{ fmt(reading.derived.standardMassKg, 0) }} kg</span>
    </div>

    <ul v-if="reading.alarms.length > 0" class="alarm-list">
      <li v-for="alarm in reading.alarms" :key="alarm.code">{{ alarm.message }} —— 已先停发并生成处置单</li>
    </ul>

    <p v-if="reading.notes" class="note">{{ reading.notes }}</p>

    <p v-if="reading.reviewStatus === '已复核'" class="muted">
      班次已冻结 · 复核人 {{ reading.reviewer }} · {{ fmtTime(reading.reviewedAt) }}
      （补充更正将带原因另存版本，旧值保留）
    </p>

    <div v-if="reading.reviewStatus === '待复核'" class="actions">
      <input
        v-model="reviewer"
        class="review-input"
        type="text"
        placeholder="复核人姓名"
        @keyup.enter="submitReview"
      />
      <button type="button" @click="submitReview">复核冻结</button>
      <button v-if="!hasOrder" class="danger" type="button" @click="remove">删除</button>
    </div>
    <div v-else class="actions">
      <button class="secondary" type="button" @click="showCorrect = !showCorrect">
        {{ showCorrect ? "收起更正" : "补充更正（另存版本）" }}
      </button>
    </div>

    <form v-if="showCorrect" class="inline-form" @submit.prevent="submitCorrect">
      <div class="form-row">
        <label>液位 mm
          <input v-model.number="correct.levelMm" type="number" min="0" required />
        </label>
        <label>水高 mm
          <input v-model.number="correct.waterMm" type="number" min="0" required />
        </label>
      </div>
      <div class="form-row">
        <label>温度 ℃
          <input v-model.number="correct.temperatureC" type="number" step="0.1" required />
        </label>
        <label>油枪累计数 L
          <input v-model.number="correct.pumpTotalL" type="number" min="0" required />
        </label>
      </div>
      <label>更正原因（随版本保存）
        <input v-model="correct.reason" type="text" required placeholder="如：读数误读，经复测更正" />
      </label>
      <label>操作人
        <input v-model="correct.operator" type="text" required />
      </label>
      <button type="submit">保存更正并保留旧值</button>
    </form>
  </article>
</template>
