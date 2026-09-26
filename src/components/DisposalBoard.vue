<script setup lang="ts">
import { computed, reactive } from "vue";
import { ElMessage } from "element-plus";
import { useReleaseDeskStore } from "../stores/releaseDesk";
import { productOf } from "../domain/catalog";
import { fmt, fmtTime } from "../utils/format";
import type { DisposalOrder } from "../domain/types";

const props = defineProps<{ order: DisposalOrder }>();
const store = useReleaseDeskStore();

const product = computed(() => productOf(props.order.productCode));
const reading = computed(() => store.readingById(props.order.readingId));

const form = reactive({
  pumpBackL: 0,
  levelMm: 0,
  waterMm: 0,
  temperatureC: 20,
  confirmer: "",
  note: "",
});

function confirm() {
  const result = store.confirmOrder(props.order.id, {
    pumpBackL: Number(form.pumpBackL),
    retest: {
      levelMm: Number(form.levelMm),
      waterMm: Number(form.waterMm),
      temperatureC: Number(form.temperatureC),
    },
    confirmer: form.confirmer,
    note: form.note,
  });
  if (!result.ok) {
    ElMessage.error(result.error ?? "确认失败");
    return;
  }
  ElMessage.success("处置已确认，该油品恢复发油");
}
</script>

<template>
  <article class="record">
    <div class="record-head">
      <p class="record-title">
        处置单 #{{ order.id.slice(0, 8) }} · {{ product.name }}
        <span class="muted">{{ order.date }} {{ order.shift }}</span>
      </p>
      <span class="status" :class="order.status === '待处置' ? 'status-warn' : ''">
        {{ order.status }}
      </span>
    </div>

    <ul class="alarm-list">
      <li v-for="trigger in order.triggers" :key="trigger.code">{{ trigger.message }}</li>
    </ul>

    <p v-if="reading" class="note">
      停发记录：液位 {{ fmt(reading.values.levelMm, 0) }} mm / 水高
      {{ fmt(reading.values.waterMm, 0) }} mm / 温度 {{ reading.values.temperatureC.toFixed(1) }}
      ℃，差异 {{ reading.derived.diffPct.toFixed(2) }}%
    </p>
    <p v-if="order.note" class="muted">处置说明：{{ order.note }}</p>

    <form v-if="order.status === '待处置'" class="inline-form" @submit.prevent="confirm">
      <p class="muted">该油品已停止发油；登记抽水回罐量、复测值并由复核人确认后才恢复。</p>
      <div class="form-row">
        <label>抽水回罐量 L
          <input v-model.number="form.pumpBackL" type="number" min="0" required />
        </label>
        <label>复测液位 mm
          <input v-model.number="form.levelMm" type="number" min="0" required />
        </label>
      </div>
      <div class="form-row">
        <label>复测水高 mm（须 ≤ 50）
          <input v-model.number="form.waterMm" type="number" min="0" required />
        </label>
        <label>复测温度 ℃
          <input v-model.number="form.temperatureC" type="number" step="0.1" required />
        </label>
      </div>
      <div class="form-row">
        <label>复核人
          <input v-model="form.confirmer" type="text" required />
        </label>
        <label>处置备注
          <input v-model="form.note" type="text" />
        </label>
      </div>
      <button type="submit">确认恢复发油</button>
    </form>

    <div v-else class="details">
      <span>抽水回罐量: {{ fmt(order.pumpBackL ?? 0, 1) }} L</span>
      <span>复测液位: {{ fmt(order.retest?.levelMm ?? 0, 0) }} mm</span>
      <span>复测水高: {{ fmt(order.retest?.waterMm ?? 0, 0) }} mm</span>
      <span>复测温度: {{ (order.retest?.temperatureC ?? 0).toFixed(1) }} ℃</span>
      <span>复核人: {{ order.confirmer }}</span>
      <span>确认时间: {{ fmtTime(order.confirmedAt) }}</span>
    </div>
  </article>
</template>
