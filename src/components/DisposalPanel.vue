<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { fuelByCode } from "../data/fuels";
import type { DisposalOrder } from "../domain/types";
import { useReleaseStore } from "../stores/releaseStore";
import { fmtLiters, fmtTime } from "./format";

const props = defineProps<{ fuelCode: string }>();
const store = useReleaseStore();

const list = computed(() =>
  store.disposals
    .filter((order) => !props.fuelCode || order.fuelCode === props.fuelCode)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

function entryLabel(order: DisposalOrder) {
  const entry = store.entryById(order.entryId);
  if (!entry) return "关联记录已不存在";
  return `${entry.values.businessDate} ${entry.values.shift} · ${entry.values.operator}`;
}

const openId = ref<string | null>(null);
const problems = ref<string[]>([]);
const disposalForm = reactive({
  pumpedLiters: 0,
  levelMm: 0,
  waterCm: 0,
  tempC: 20,
  reviewer: "",
  note: "",
});

function openConfirm(order: DisposalOrder) {
  const entry = store.entryById(order.entryId);
  openId.value = order.id;
  problems.value = [];
  Object.assign(disposalForm, {
    pumpedLiters: 0,
    levelMm: entry?.values.levelMm ?? 0,
    waterCm: entry?.values.waterCm ?? 0,
    tempC: entry?.values.tempC ?? 20,
    reviewer: "",
    note: "",
  });
}

function confirm(order: DisposalOrder) {
  const result = store.confirmDisposal(order.id, {
    pumpedLiters: Number(disposalForm.pumpedLiters) || 0,
    remeasure: {
      levelMm: Number(disposalForm.levelMm) || 0,
      waterCm: Number(disposalForm.waterCm) || 0,
      tempC: Number(disposalForm.tempC) || 0,
    },
    reviewer: disposalForm.reviewer.trim(),
    note: disposalForm.note.trim(),
  });
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  ElMessage.success("处置已确认，该油品恢复发油，后续班次以复测值衔接");
  openId.value = null;
  problems.value = [];
}
</script>

<template>
  <div class="record-grid">
    <div v-if="list.length === 0" class="empty">暂无处置单</div>
    <article
      v-for="order in list"
      :key="order.id"
      class="record"
      :class="{ 'record-stop': order.status === '待处置' }"
    >
      <div class="record-head">
        <p class="record-title">{{ fuelByCode(order.fuelCode).name }} · 停发处置单</p>
        <span class="badge" :class="order.status === '待处置' ? 'stop' : 'ok'">
          {{ order.status }}
        </span>
      </div>

      <div class="details">
        <span>触发班次：{{ entryLabel(order) }}</span>
        <span>生成时间：{{ fmtTime(order.createdAt) }}</span>
        <template v-if="order.status === '已确认'">
          <span>抽水回罐量：{{ fmtLiters(order.pumpedLiters) }}</span>
          <span>复核人：{{ order.reviewer }}</span>
          <span v-if="order.remeasure">
            复测：液位 {{ order.remeasure.levelMm }}mm / 水高 {{ order.remeasure.waterCm }}cm /
            {{ order.remeasure.tempC }}°C
          </span>
          <span>确认时间：{{ fmtTime(order.confirmedAt) }}</span>
        </template>
      </div>

      <ul class="triggers">
        <li v-for="trigger in order.triggers" :key="trigger">{{ trigger }}</li>
      </ul>
      <p v-if="order.note" class="note">{{ order.note }}</p>

      <div v-if="order.status === '待处置'" class="actions">
        <button v-if="openId !== order.id" type="button" @click="openConfirm(order)">
          登记处置并恢复
        </button>
      </div>

      <div v-if="openId === order.id && order.status === '待处置'" class="disposal-form">
        <div class="field-row">
          <label>
            抽水回罐量（L）
            <input v-model="disposalForm.pumpedLiters" type="number" min="0" step="0.1" />
          </label>
          <label>
            复核人
            <input v-model="disposalForm.reviewer" type="text" placeholder="填写复核人姓名" />
          </label>
        </div>
        <div class="field-row three">
          <label>
            复测液位（mm）
            <input v-model="disposalForm.levelMm" type="number" min="0" step="1" />
          </label>
          <label>
            复测水高（cm）
            <input v-model="disposalForm.waterCm" type="number" min="0" step="0.1" />
          </label>
          <label>
            复测温度（°C）
            <input v-model="disposalForm.tempC" type="number" step="0.1" />
          </label>
        </div>
        <label>
          处置备注
          <textarea v-model="disposalForm.note" placeholder="如：罐底抽水、管线回罐、复测合格" />
        </label>
        <ul v-if="problems.length > 0" class="triggers">
          <li v-for="problem in problems" :key="problem">{{ problem }}</li>
        </ul>
        <div class="actions">
          <button type="button" @click="confirm(order)">确认恢复发油</button>
          <button class="secondary" type="button" @click="openId = null">收起</button>
        </div>
      </div>
    </article>
  </div>
</template>
