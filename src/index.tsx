// AIERC Wallet Guard — Insight. A MetaMask Snap. v0.1.0
//
// What this is: the insight-only front door on MetaMask. It asks for transaction
// insight, signature insight and network access, and nothing else — no accounts,
// no keys, no dialogs. Those three permissions carry no third-party audit
// requirement on MetaMask's allowlist (read 2026-09-20); the key-management
// permissions of the keyring Snap (AIERC Wallet Guard 2.8.0) do.
//
// What the user sees on the confirmation screen is what was DETERMINED, never a
// blacklist sentence: the operation, the counterparty's record, and the
// determination with its facts. The user signs or not. The RPC lane applies the
// user's own block preference when the signed transaction is sent.
//
// Carried from AIERC Wallet Guard 2.8.0 (cryptoclyde-CLARITY/snap/src/index.tsx):
// the evaluator call, the value/address formatters, the transaction and
// signature handlers. Dropped: every keyring, account, state and dialog path.

import type { OnTransactionHandler, OnSignatureHandler } from '@metamask/snaps-sdk';
import { Box, Heading, Text, Row, Divider } from '@metamask/snaps-sdk/jsx';

// ─── Configuration ───────────────────────────────────────────────────────────

/** The determination: CLEAN / FLAGGED with the facts behind it. */
const EVALUATE_API = 'https://wallet.aierc.tech/snap/evaluate';
/** The counterparty's record: a tally of prior determinations, never a score. */
const COUNTERPARTY_API = 'https://determine.aierc.tech/v1/counterparty';
const TIMEOUT_MS = 8000;

// ─── Types ───────────────────────────────────────────────────────────────────

type Level = 'CLEAN' | 'FLAGGED';

interface Evaluation {
  level: Level;
  facts: string[];
  explanation: string;
  operationDescription: string;
  reasoningHash: string;
}

interface Counterparty {
  known: boolean;
  clean: number;
  flagged: number;
  settlements: number;
  blacklisted: boolean;
  statement: string;
}

// ─── Network ─────────────────────────────────────────────────────────────────

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function evaluate(params: {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  chainId?: string;
  origin?: string;
}): Promise<Evaluation | null> {
  const data = (await fetchJson(EVALUATE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: params.from ?? '0x0000000000000000000000000000000000000000',
      to: params.to,
      value: params.value ?? '0x0',
      data: params.data ?? '0x',
      chainId: params.chainId,
      origin: params.origin,
    }),
  })) as Partial<Evaluation> | null;
  // Shape guard: anything but the CLEAN/FLAGGED contract is "not examined".
  if (!data || (data.level !== 'CLEAN' && data.level !== 'FLAGGED')) return null;
  return {
    level: data.level,
    facts: Array.isArray(data.facts) ? data.facts.filter((f): f is string => typeof f === 'string') : [],
    explanation: typeof data.explanation === 'string' ? data.explanation : '',
    operationDescription: typeof data.operationDescription === 'string' ? data.operationDescription : '',
    reasoningHash: typeof data.reasoningHash === 'string' ? data.reasoningHash : '',
  };
}

async function counterparty(address?: string, chainId?: string): Promise<Counterparty | null> {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const numeric = numericChain(chainId);
  const url = `${COUNTERPARTY_API}?address=${address.toLowerCase()}${numeric ? `&chainId=${numeric}` : ''}`;
  const data = (await fetchJson(url)) as Partial<Counterparty> | null;
  if (!data || typeof data.known !== 'boolean') return null;
  return {
    known: data.known,
    clean: Number(data.clean ?? 0),
    flagged: Number(data.flagged ?? 0),
    settlements: Number(data.settlements ?? 0),
    blacklisted: data.blacklisted === true,
    statement: typeof data.statement === 'string' ? data.statement : '',
  };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/** MetaMask hands the chain as CAIP-2 ("eip155:84532"); the record API wants the number. */
function numericChain(chainId?: string): string | undefined {
  if (!chainId) return undefined;
  const m = /^eip155:(\d+)$/.exec(chainId);
  if (m) return m[1];
  return /^\d+$/.test(chainId) ? chainId : undefined;
}

function formatValue(hexValue?: string): string {
  if (!hexValue || hexValue === '0x0' || hexValue === '0x') return '0';
  try {
    const eth = Number(BigInt(hexValue)) / 1e18;
    if (eth === 0) return '0';
    if (eth < 0.001) return '< 0.001';
    return eth.toFixed(4);
  } catch {
    return 'Unknown';
  }
}

function truncateAddress(addr?: string): string {
  if (!addr) return 'Unknown';
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

/** The counterparty's record in one line: a tally, never a score. */
function recordLine(cp: Counterparty | null): string {
  if (!cp) return 'Record not reachable.';
  if (cp.blacklisted) return 'On the AIERC bad-actor set.';
  if (!cp.known) return 'First dealing: no prior determination on this party.';
  const total = cp.clean + cp.flagged;
  return `${total} prior determination${total === 1 ? '' : 's'}: ${cp.clean} clean, ${cp.flagged} flagged; ${cp.settlements} settled deal${cp.settlements === 1 ? '' : 's'}.`;
}

// ─── Transaction insight ─────────────────────────────────────────────────────

export const onTransaction: OnTransactionHandler = async ({ transaction, chainId, transactionOrigin }) => {
  const to = transaction.to as string | undefined;
  const [evaluation, record] = await Promise.all([
    evaluate({
      from: transaction.from as string | undefined,
      to,
      value: transaction.value as string | undefined,
      data: transaction.data as string | undefined,
      chainId,
      origin: transactionOrigin ?? undefined,
    }),
    counterparty(to, chainId),
  ]);

  const details = (
    <Box>
      <Row label="To"><Text>{truncateAddress(to)}</Text></Row>
      <Row label="Value"><Text>{formatValue(transaction.value as string | undefined)}</Text></Row>
      {transactionOrigin ? <Row label="Site"><Text>{transactionOrigin}</Text></Row> : null}
      <Row label="Record"><Text>{recordLine(record)}</Text></Row>
    </Box>
  );

  if (!evaluation) {
    return {
      content: (
        <Box>
          <Heading>AIERC: not examined</Heading>
          <Text>The determination service could not be reached, so this transaction was not examined. Nothing on this screen says it is safe.</Text>
          <Divider />
          {details}
          <Divider />
          <Text>Powered by AIERC</Text>
        </Box>
      ),
    };
  }

  const operation = evaluation.operationDescription || 'Transaction';

  if (evaluation.level === 'CLEAN') {
    return {
      content: (
        <Box>
          <Heading>AIERC determination: CLEAN</Heading>
          <Row label="Operation"><Text>{operation}</Text></Row>
          <Divider />
          {details}
          <Divider />
          <Text>The evaluator examined the operation, the recipient and the call data and raised no finding. Your wallet's own block setting applies when you send.</Text>
          <Text>Powered by AIERC</Text>
        </Box>
      ),
    };
  }

  return {
    content: (
      <Box>
        <Heading>AIERC determination: FLAGGED</Heading>
        <Row label="Operation"><Text>{operation}</Text></Row>
        {evaluation.explanation ? <Text>{evaluation.explanation}</Text> : null}
        <Divider />
        {details}
        <Divider />
        <Heading>What was found</Heading>
        {evaluation.facts.length
          ? evaluation.facts.map((fact, i) => <Text key={`f-${i}`}>- {fact}</Text>)
          : <Text>- The evaluator flagged this transaction without listing separate facts.</Text>}
        <Divider />
        <Text>Your money, your call. Read the facts before you sign. Your wallet's own block setting applies when you send.</Text>
        <Text>Powered by AIERC</Text>
      </Box>
    ),
    severity: 'critical',
  };
};

// ─── Signature insight ───────────────────────────────────────────────────────

export const onSignature: OnSignatureHandler = async ({ signature, signatureOrigin }) => {
  const method = signature.signatureMethod ?? 'unknown';
  const site = signatureOrigin ?? 'Unknown site';

  let isPermit = false;
  let spender = '';
  let tokenAddress = '';
  let chainId: string | undefined;

  if ('domain' in signature && 'message' in signature) {
    const typed = signature as {
      domain?: { verifyingContract?: string; chainId?: number | string };
      primaryType?: string;
      message?: Record<string, unknown>;
    };
    if (typed.primaryType === 'Permit' || typed.primaryType === 'Permit2' || typed.primaryType === 'PermitSingle' || typed.primaryType === 'PermitBatch') {
      isPermit = true;
      spender = (typed.message?.spender as string) ?? ((typed.message?.details as { spender?: string } | undefined)?.spender ?? '');
      tokenAddress = typed.domain?.verifyingContract ?? '';
      chainId = typed.domain?.chainId != null ? String(typed.domain.chainId) : undefined;
    }
  }

  if (isPermit && tokenAddress) {
    const [evaluation, record] = await Promise.all([
      evaluate({ to: tokenAddress, data: '0x095ea7b3', origin: site, chainId }),
      counterparty(spender || undefined, chainId),
    ]);

    const details = (
      <Box>
        <Row label="Type"><Text>Token permit (approval by signature, no transaction)</Text></Row>
        <Row label="Token"><Text>{truncateAddress(tokenAddress)}</Text></Row>
        <Row label="Spender"><Text>{truncateAddress(spender)}</Text></Row>
        <Row label="Site"><Text>{site}</Text></Row>
        <Row label="Spender record"><Text>{recordLine(record)}</Text></Row>
      </Box>
    );

    if (evaluation && evaluation.level === 'FLAGGED') {
      return {
        content: (
          <Box>
            <Heading>AIERC determination: FLAGGED</Heading>
            {evaluation.explanation ? <Text>{evaluation.explanation}</Text> : null}
            <Divider />
            {details}
            <Divider />
            <Heading>What was found</Heading>
            {evaluation.facts.length
              ? evaluation.facts.map((fact, i) => <Text key={`pf-${i}`}>- {fact}</Text>)
              : <Text>- The evaluator flagged this permit without listing separate facts.</Text>}
            <Divider />
            <Text>A permit gives the spender access to your tokens without a transaction. Sign only if you trust the site and the spender.</Text>
            <Text>Powered by AIERC</Text>
          </Box>
        ),
        severity: 'critical',
      };
    }

    return {
      content: (
        <Box>
          <Heading>{evaluation ? 'AIERC determination: CLEAN' : 'AIERC: not examined'}</Heading>
          <Divider />
          {details}
          <Divider />
          <Text>
            {evaluation
              ? 'The evaluator examined the token and the spender and raised no finding. A permit still gives the spender access to your tokens without a transaction; sign only if you trust the site.'
              : 'The determination service could not be reached, so this permit was not examined. A permit gives the spender access to your tokens without a transaction.'}
          </Text>
          <Text>Powered by AIERC</Text>
        </Box>
      ),
    };
  }

  return {
    content: (
      <Box>
        <Heading>AIERC</Heading>
        <Row label="Type"><Text>{method}</Text></Row>
        <Row label="Site"><Text>{site}</Text></Row>
        <Divider />
        <Text>This message is not a transaction or a token permit, so there is no operation to determine. Read the message before you sign it.</Text>
        <Text>Powered by AIERC</Text>
      </Box>
    ),
  };
};
