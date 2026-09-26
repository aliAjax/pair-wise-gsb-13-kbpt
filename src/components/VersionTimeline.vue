<script setup lang="ts">
import { computed } from "vue";
import { useReleaseDeskStore } from "../stores/releaseDesk";
import { productOf } from "../domain/catalog";
import { fmt, fmtPct, fmtTime } from "../utils/format";
import type { CorrectionVersion } from "../domain/types";

const props = defineProps<{ versions: CorrectionVersion[] }>();
const store = useReleaseDeskStore();

const items = computed(() =>
  props.versions.map((version) => ({
    version,
    reading: store.readingById(version.readingId),
  }))
);

function productName(code: string | undefined): string {
  return code ? productOf(code).name : "未知油品";
}
</script>

<template>
  <div v-if="items.length === 0" class="empty">暂无更正版本，已复核班次冻结后才可更正</div>
  <article v-for="item in items" :key="item.version.id" class="version-item">
    <div class="record-head">
      <p class="record-title">
        {{ productName(item.reading?.productCode) }}
        <template v-if="item.reading">· {{ item.reading.date }} {{ item.reading.shift }}</template>
        <span class="muted">v{{ item.version.version }} → v{{ item.version.version + 1 }}</span>
      </p>
      <span class="status status-muted">旧值已保留</span>
    </div>

    <div class="details">
      <span>旧液位: {{ fmt(item.version.snapshot.levelMm, 0) }} mm</span>
      <span>旧水高: {{ fmt(item.version.snapshot.waterMm, 0) }} mm</span>
      <span>旧温度: {{ item.version.snapshot.temperatureC.toFixed(1) }} ℃</span>
      <span>旧油枪累计: {{ fmt(item.version.snapshot.pumpTotalL, 0) }} L</span>
      <span>旧标准体积: {{ fmt(item.version.derived.standardVolumeL, 1) }} L</span>
      <span>旧库存差异: {{ fmtPct(item.version.derived.diffPct) }}</span>
    </div>

    <p class="note">更正原因：{{ item.version.reason }}</p>
    <p class="muted">操作人 {{ item.version.operator }} · {{ fmtTime(item.version.createdAt) }}</p>
  </article>
</template>
