<script setup lang="ts">
import { computed } from "vue";
import { fuelByCode } from "../data/fuels";
import { useReleaseStore } from "../stores/releaseStore";
import { fmtLiters, fmtTime } from "./format";

const props = defineProps<{ fuelCode: string }>();
const store = useReleaseStore();

const items = computed(() => store.versionHistory(props.fuelCode || undefined));
</script>

<template>
  <div class="record-grid">
    <div v-if="items.length === 0" class="empty">暂无更正版本</div>
    <article v-for="item in items" :key="`${item.entry.id}-v${item.version.version}`" class="record">
      <div class="record-head">
        <p class="record-title">
          {{ fuelByCode(item.entry.fuelCode).name }} · {{ item.entry.values.businessDate }}
          {{ item.entry.values.shift }}
        </p>
        <span class="badge version">v{{ item.version.version }} → v{{ item.version.version + 1 }}</span>
      </div>

      <p class="note">
        {{ item.version.reason }}（{{ item.version.changedBy }} ·
        {{ fmtTime(item.version.changedAt) }}）
      </p>

      <div class="version-compare">
        <div>
          <h4>旧值 v{{ item.version.version }}（已留档）</h4>
          <div class="details">
            <span>液位：{{ item.version.snapshot.values.levelMm }} mm</span>
            <span>水高：{{ item.version.snapshot.values.waterCm }} cm</span>
            <span>温度：{{ item.version.snapshot.values.tempC }} °C</span>
            <span>油枪累计：{{ fmtLiters(item.version.snapshot.values.nozzleTotal) }}</span>
            <span>实测库存(V20)：{{ fmtLiters(item.version.snapshot.verdict.v20Measured) }}</span>
            <span>交班人：{{ item.version.snapshot.values.operator }}</span>
          </div>
        </div>
        <div>
          <h4>当前值 v{{ item.entry.version }}</h4>
          <div class="details">
            <span>液位：{{ item.entry.values.levelMm }} mm</span>
            <span>水高：{{ item.entry.values.waterCm }} cm</span>
            <span>温度：{{ item.entry.values.tempC }} °C</span>
            <span>油枪累计：{{ fmtLiters(item.entry.values.nozzleTotal) }}</span>
            <span>实测库存(V20)：{{ fmtLiters(item.entry.verdict.v20Measured) }}</span>
            <span>交班人：{{ item.entry.values.operator }}</span>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
