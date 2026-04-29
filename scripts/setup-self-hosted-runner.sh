#!/usr/bin/env bash
# ============================================================================
# setup-self-hosted-runner.sh
# ----------------------------------------------------------------------------
# One-time install of a GitHub Actions self-hosted runner on the VM.
# Once installed, workflows with `runs-on: self-hosted` execute on this
# VM directly — bypassing GitHub-hosted minute quotas entirely.
#
# Usage:
#   1. On GitHub: Settings → Actions → Runners → New self-hosted runner.
#      Choose Linux x64. Copy the registration TOKEN it shows.
#   2. SSH to the VM:
#      curl -fsSL https://raw.githubusercontent.com/contentincubator2-ops/Marketing-OS/main/scripts/setup-self-hosted-runner.sh | bash -s -- <TOKEN>
#      (or copy this file across and run: bash setup-self-hosted-runner.sh <TOKEN>)
#
# The runner installs as a systemd service so it survives reboots.
# ============================================================================
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-contentincubator2-ops/Marketing-OS}"
RUNNER_VERSION="${RUNNER_VERSION:-2.320.0}"
RUNNER_NAME="${RUNNER_NAME:-vm-marketing-os}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,vm-marketing-os}"
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner}"

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: registration token required."
  echo "Get one from: https://github.com/${GITHUB_REPO}/settings/actions/runners/new?arch=x64&os=linux"
  exit 1
fi

echo "════ GitHub Actions self-hosted runner setup ════"
echo "Repo:    ${GITHUB_REPO}"
echo "Version: ${RUNNER_VERSION}"
echo "Name:    ${RUNNER_NAME}"
echo "Labels:  ${RUNNER_LABELS}"
echo "Dir:     ${RUNNER_DIR}"
echo

# ── 1. Prereqs ───────────────────────────────────────────────────────────────
if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y curl tar
fi

# ── 2. Download runner ──────────────────────────────────────────────────────
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"
if [ ! -f "./config.sh" ]; then
  echo "── Downloading runner ${RUNNER_VERSION} ──"
  curl -fsSL -o actions-runner-linux-x64.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  tar xzf actions-runner-linux-x64.tar.gz
  rm actions-runner-linux-x64.tar.gz
else
  echo "── Runner already extracted at ${RUNNER_DIR} ──"
fi

# ── 3. Install runner deps (sudo apt) ────────────────────────────────────────
if [ -f "./bin/installdependencies.sh" ]; then
  echo "── Installing runner dependencies ──"
  sudo ./bin/installdependencies.sh
fi

# ── 4. Configure ─────────────────────────────────────────────────────────────
# If already configured, remove first so re-running this script works idempotently.
if [ -f ".runner" ]; then
  echo "── Existing config detected; removing before re-config ──"
  ./config.sh remove --token "$TOKEN" || true
fi

./config.sh \
  --url "https://github.com/${GITHUB_REPO}" \
  --token "$TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --work "_work" \
  --unattended \
  --replace

# ── 5. Install as systemd service ────────────────────────────────────────────
echo "── Installing as systemd service ──"
sudo ./svc.sh install "${SUDO_USER:-$USER}"
sudo ./svc.sh start
sudo ./svc.sh status

echo
echo "════ Done ════"
echo "Runner registered as '$RUNNER_NAME' with labels [${RUNNER_LABELS}]."
echo "Verify at: https://github.com/${GITHUB_REPO}/settings/actions/runners"
echo
echo "Next: workflows that opt-in via 'runs-on: self-hosted' will now run on this VM."
