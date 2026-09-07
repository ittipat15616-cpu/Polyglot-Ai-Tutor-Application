const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboardArea.tsx', 'utf8');

const importStatement = `import { Shield, Users, RefreshCw, Coins, Calendar, CheckCircle, Lock } from 'lucide-react';\nimport { UserSubscriptionState, TIER_CONFIGS } from '../types/subscription';`;
const newImportStatement = `import { Shield, Users, RefreshCw, Coins, Calendar, CheckCircle, Lock } from 'lucide-react';\nimport { UserSubscriptionState, TIER_CONFIGS } from '../types/subscription';\nimport { getEffectiveSubscriptionState } from '../services/subscriptionService';`;

if (!code.includes("getEffectiveSubscriptionState")) {
    code = code.replace(importStatement, newImportStatement);
}

const mapLogic = `        usersList.push({
          ...data,
          subState: subSnap.exists() ? (subSnap.data() as UserSubscriptionState) : undefined
        });`;

const newMapLogic = `        let userSubState = subSnap.exists() ? (subSnap.data() as UserSubscriptionState) : undefined;
        if (userSubState) {
          const { state: effectiveState } = getEffectiveSubscriptionState(userSubState);
          userSubState = effectiveState;
        }
        usersList.push({
          ...data,
          subState: userSubState
        });`;

code = code.replace(mapLogic, newMapLogic);
fs.writeFileSync('src/components/AdminDashboardArea.tsx', code);
console.log("Patched AdminDashboardArea");
