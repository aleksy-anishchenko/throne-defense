<script setup lang="ts">
import type { RewardId } from '@throne/game'
import warChest from '@/assets/rewards/war-chest.svg'
import fieldMedic from '@/assets/rewards/field-medic.svg'
import sharpenedSteel from '@/assets/rewards/sharpened-steel.svg'
import rapidOrders from '@/assets/rewards/rapid-orders.svg'
import bounty from '@/assets/rewards/bounty.svg'
import royalTax from '@/assets/rewards/royal-tax.svg'
import militaryEngineer from '@/assets/rewards/military-engineer.svg'
import wildfire from '@/assets/rewards/wildfire.svg'
import controlMaster from '@/assets/rewards/control-master.svg'
import lastStand from '@/assets/rewards/last-stand.svg'
import rasputitsa from '@/assets/rewards/rasputitsa.svg'
import giantDiet from '@/assets/rewards/giant-diet.svg'
import throneMoat from '@/assets/rewards/throne-moat.svg'
import emptyVials from '@/assets/rewards/empty-vials.svg'
import panicInFormation from '@/assets/rewards/panic-in-formation.svg'
import doubleShot from '@/assets/rewards/double-shot.svg'
import twoBells from '@/assets/rewards/two-bells.svg'
import iceAndFire from '@/assets/rewards/ice-and-fire.svg'

defineProps<{ rewardId: RewardId }>()

const illustrations = {
  'war-chest': warChest,
  'field-medic': fieldMedic,
  'sharpened-steel': sharpenedSteel,
  'rapid-orders': rapidOrders,
  bounty,
  'royal-tax': royalTax,
  'military-engineer': militaryEngineer,
  wildfire,
  'control-master': controlMaster,
  'last-stand': lastStand,
  rasputitsa,
  'giant-diet': giantDiet,
  'throne-moat': throneMoat,
  'empty-vials': emptyVials,
  'panic-in-formation': panicInFormation,
  'double-shot': doubleShot,
  'two-bells': twoBells,
  'ice-and-fire': iceAndFire,
} satisfies Record<RewardId, string>
</script>

<template>
  <span class="reward-mark" aria-hidden="true">
    <img :src="illustrations[rewardId]" alt="" draggable="false" />
  </span>
</template>
