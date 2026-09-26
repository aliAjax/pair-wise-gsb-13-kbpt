<script setup lang="ts">
import { computed } from "vue";
import { useReleaseStore } from "../stores/releaseStore";
import { fmtPct } from "./format";

const store = useReleaseStore();

const cards = computed(() =>
  store.fuels.map((fuel) => {
    const latest = store.latestEntry(fuel.code);
    const pending = store.pendingDisposal(fuel.code);
    return { fuel, latest, pending, suspended: Boolean(pending) };
  })
);
</script>

<template>
  <section class="fuel-board">
    <article
      v-for="card in cards"
      :key="card.fuel.code"
      class="fuel-card"
      :class="{ stopped: card.suspended }"
    >
      <div class="fuel-head">
        <div class="fuel-name">
          <strong>{{ card.fuel.name }}</strong>
          <span class="tank">罐号 {{ card.fuel.tank.tankNo }}</span>
        </div>
        <span class="badge" :class="card.suspended ? 'stop' : 'ok'">
          {{ card.suspended ? "停发中" : "正常发油" }}
        </span>
      </div>
      <div v-if="card.latest" class="fuel-latest">
        <span>液位 {{ card.latest.values.levelMm }}mm</span>
        <span>水高 {{ card.latest.values.waterCm }}cm</span>
        <span>温度 {{ card.latest.values.tempC }}°C</span>
        <span :class="{ bad: card.latest.verdict.triggers.length > 0 }">
          差异 {{ fmtPct(card.latest.verdict.diffPct) }}
        </span>
      </div>
      <p v-else class="fuel-empty">暂无交接记录</p>
      <p v-if="card.pending" class="fuel-stop-reason">
        停发原因：{{ card.pending.triggers.join("；") }}。处置单待确认，确认前禁止发油。
      </p>
    </article>
  </section>
</template>
