const platformStages = [
    { name: '지구 발사 기지', color: '#56d6ab', gaps: [[290, 352], [590, 660]], ledges: [[405, 206, 65]], stars: [[170, 251], [453, 184], [704, 251]] },
    { name: '달의 크레이터', color: '#aab9ff', gaps: [[210, 295], [580, 680]], ledges: [[358, 201, 112]], stars: [[246, 208], [415, 179], [744, 251]], gravity: 860 },
    { name: '화성 협곡', color: '#ff9c72', gaps: [[260, 375], [565, 657]], ledges: [[279, 201, 78], [699, 199, 95]], stars: [[313, 179], [494, 251], [742, 177]], pad: 212 },
    { name: '소행성 벨트', color: '#f3c577', gaps: [[224, 314], [605, 706]], ledges: [[413, 190, 65]], stars: [[264, 210], [460, 168], [760, 251]], drone: [398, 552] },
    { name: '목성 관측 기지', color: '#f0acde', gaps: [[255, 355], [640, 740]], ledges: [[272, 194, 70], [770, 200, 80]], stars: [[307, 172], [468, 251], [810, 178]], pad: 210, drone: [446, 492] }
];

const platformHints = [
    '짧게 달린 뒤 점프하면 틈을 건널 수 있습니다.',
    '달에서는 중력이 약해 조금 더 오래 떠 있습니다.',
    '빛나는 점프대 위에 서면 높이 튀어 오릅니다.',
    '순찰 드론이 보이면 점프로 피하세요.',
    '점프대와 발판을 이용해 마지막 기지에 도착하세요.'
];
const fieldWidth = 980;
const viewWidth = 720;
const groundY = 266;
const playerSize = { width: 24, height: 30 };
const platformKeys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ' ': 'jump', a: 'left', d: 'right', w: 'jump' };
let platformGame;
let platformFrame = 0;

function startDemo() {
    const dialog = document.querySelector('#demo');
    if (!dialog.open) dialog.showModal();
    cancelAnimationFrame(platformFrame);
    platformGame = undefined;
    document.querySelector('#game').innerHTML = `
        <div class="eyebrow platform-kicker">태양계 탐험대 · 1인용 체험</div>
        <h1>점프! 태양계 탐험대</h1>
        <p>탐사 대원을 움직여 발판을 건너고 별을 모으세요. 각 구간 끝의 문제 상자를 열어 태양계 퀴즈를 맞히면 다음 구간으로 이동합니다.</p>
        <div class="platform-rules"><span><b>이동</b> ← → 또는 A / D</span><span><b>점프</b> ↑ 또는 스페이스</span><span><b>휴대폰</b> 화면 버튼</span></div>
        <p class="platform-note">떨어지거나 드론에 닿으면 가까운 안전 지점에서 이어갑니다. 별은 선택 보너스입니다.</p>
        <button class="primary" onclick="beginPlatformGame()">탐험 시작 →</button>`;
    document.querySelector('#game .primary').focus();
}

function beginPlatformGame() {
    platformGame = { stage: 0, stars: new Set(), firstCorrect: 0, missed: [], inputs: new Set() };
    showPlatformStage();
}

function showPlatformStage() {
    const game = platformGame;
    const stage = platformStages[game.stage];
    let left = 0;
    game.floor = stage.gaps.map(([start, end]) => {
        const segment = [left, groundY, start - left];
        left = end;
        return segment;
    });
    game.floor.push([left, groundY, fieldWidth - left]);
    game.checkpoint = game.floor[1][0] + 18;
    game.spawn = 44;
    game.clock = 0;
    game.protectedUntil = 0;
    game.paused = false;
    game.inputs.clear();
    game.jumpQueued = false;
    placeExplorer();
    document.querySelector('#game').innerHTML = `
        <div class="eyebrow platform-kicker">구간 ${game.stage + 1} / ${platformStages.length} · ${stage.name}</div>
        <p class="platform-hud"><span id="platform-stars">별 ${game.stars.size} / 15</span> <span id="platform-status" role="status">${platformHints[game.stage]}</span></p>
        <canvas id="platform-world" width="720" height="306" aria-label="${stage.name} 탐험 코스" tabindex="0">화면 아래 이동 버튼으로 탐험하세요.</canvas>
        <div class="platform-controls" aria-label="탐사 대원 조작">
            <button type="button" data-move="left" aria-label="왼쪽으로 이동">←</button>
            <button type="button" data-move="right" aria-label="오른쪽으로 이동">→</button>
            <button type="button" data-move="jump">↑ 점프</button>
            <button type="button" onclick="resetExplorer()">안전 지점으로</button>
        </div>
        <p class="platform-note">방향키 또는 화면 버튼으로 움직이세요. 문제 상자에 닿으면 퀴즈가 열립니다.</p>
        <section id="platform-quiz" hidden></section>`;
    game.canvas = document.querySelector('#platform-world');
    game.context = game.canvas.getContext('2d');
    document.querySelectorAll('[data-move]').forEach(bindPlatformControl);
    game.canvas.focus();
    cancelAnimationFrame(platformFrame);
    drawPlatform();
    let lastTime = performance.now();
    const tick = now => {
        if (platformGame !== game || game.paused || !document.querySelector('#demo').open) return;
        stepPlatform(Math.min((now - lastTime) / 1000, 1 / 30));
        lastTime = now;
        drawPlatform();
        if (!game.paused) platformFrame = requestAnimationFrame(tick);
    };
    platformFrame = requestAnimationFrame(tick);
}

function bindPlatformControl(button) {
    const action = button.dataset.move;
    const input = 'pointer:' + action;
    button.addEventListener('pointerdown', event => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        setPlatformInput(input, action);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, () => platformGame?.inputs.delete(input));
    }
    button.addEventListener('click', event => {
        if (event.detail || !platformGame || platformGame.paused) return;
        if (action === 'jump') platformGame.jumpQueued = true;
        else {
            const game = platformGame;
            setPlatformInput(input, action);
            setTimeout(() => game.inputs.delete(input), 170);
        }
    });
}

function setPlatformInput(input, action) {
    if (!platformGame || platformGame.paused) return;
    if (action === 'jump') platformGame.jumpQueued = true;
    else platformGame.inputs.add(input);
}

document.addEventListener('keydown', event => {
    const action = platformKeys[event.key];
    if (!action || !platformGame || platformGame.paused || !document.querySelector('#demo').open) return;
    if (event.key === ' ' && event.target.closest('button')) return;
    event.preventDefault();
    if (!event.repeat) setPlatformInput('key:' + action, action);
});
document.addEventListener('keyup', event => {
    const action = platformKeys[event.key];
    if (action) platformGame?.inputs.delete('key:' + action);
});
window.addEventListener('blur', () => platformGame?.inputs.clear());
document.querySelector('#demo').addEventListener('close', () => {
    cancelAnimationFrame(platformFrame);
    platformGame = undefined;
});

function placeExplorer() {
    const game = platformGame;
    game.player = { x: game.spawn, y: groundY - playerSize.height, velocity: 0, grounded: true, facing: 1 };
}

function resetExplorer() {
    if (!platformGame || platformGame.paused) return;
    platformGame.jumpQueued = false;
    placeExplorer();
    platformGame.protectedUntil = platformGame.clock + 0.85;
    document.querySelector('#platform-status').textContent = '안전 지점에서 다시 출발합니다.';
}

function dronePosition(stage, time) {
    return stage.drone && stage.drone[0] + (stage.drone[1] - stage.drone[0]) * (0.5 + 0.5 * Math.sin(time * 2.2));
}

function stepPlatform(dt) {
    const game = platformGame;
    const stage = platformStages[game.stage];
    const player = game.player;
    const direction = Number(game.inputs.has('key:right') || game.inputs.has('pointer:right')) - Number(game.inputs.has('key:left') || game.inputs.has('pointer:left'));
    if (direction) player.facing = direction;
    player.x = Math.max(0, Math.min(fieldWidth - playerSize.width, player.x + direction * 232 * dt));

    if (player.grounded && game.jumpQueued) player.velocity = -475;
    if (player.grounded && stage.pad !== undefined && Math.abs(player.x + 12 - stage.pad) < 14 && player.y > 210) player.velocity = -590;
    game.jumpQueued = false;
    const oldFeet = player.y + playerSize.height;
    player.velocity += (stage.gravity || 1090) * dt;
    player.y += player.velocity * dt;
    player.grounded = false;
    if (player.velocity >= 0) {
        for (const [x, y, width] of [...stage.ledges, ...game.floor]) {
            if (oldFeet <= y + 0.1 && player.y + playerSize.height >= y && player.x + playerSize.width > x && player.x < x + width) {
                player.y = y - playerSize.height;
                player.velocity = 0;
                player.grounded = true;
                break;
            }
        }
    }

    if (player.grounded && player.x >= game.checkpoint && player.x < stage.gaps[1][0] - 35 && game.spawn !== game.checkpoint) {
        game.spawn = game.checkpoint;
        document.querySelector('#platform-status').textContent = '체크포인트에 도착했습니다.';
    }
    game.clock += dt;
    const drone = dronePosition(stage, game.clock);
    if (player.y > 336 || (drone !== undefined && game.clock >= game.protectedUntil && Math.abs(player.x + 12 - drone) < 23 && Math.abs(player.y + 15 - 247) < 23)) {
        resetExplorer();
        return;
    }
    stage.stars.forEach(([x, y], i) => {
        const id = game.stage * 3 + i;
        if (game.stars.has(id) || Math.abs(player.x + 12 - x) > 22 || Math.abs(player.y + 15 - y) > 23) return;
        game.stars.add(id);
        document.querySelector('#platform-stars').textContent = '별 ' + game.stars.size + ' / 15';
    });
    if (player.x + playerSize.width >= 925) openPlatformQuiz();
}

function drawPlatform() {
    const game = platformGame;
    const stage = platformStages[game.stage];
    const {context: ctx, player} = game;
    const camera = Math.max(0, Math.min(fieldWidth - viewWidth, player.x - 245));
    const sky = ctx.createLinearGradient(0, 0, 0, 306);
    sky.addColorStop(0, '#0a1232');
    sky.addColorStop(1, '#202451');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewWidth, 306);
    ctx.fillStyle = '#b6c6f4';
    for (let i = 0; i < 55; i++) {
        const x = ((i * 179 + 990 - camera * 0.35) % 760);
        ctx.fillRect(x, 12 + (i * 83) % 212, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = stage.color;
    ctx.beginPath();
    ctx.arc(540 - camera * 0.2, 85, 47 + game.stage * 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(-camera, 0);
    for (const [x, y, width] of [...game.floor, ...stage.ledges]) {
        ctx.fillStyle = '#343966';
        ctx.fillRect(x, y, width, y === groundY ? 40 : 15);
        ctx.fillStyle = stage.color;
        ctx.fillRect(x, y, width, 4);
    }
    if (stage.pad !== undefined) {
        ctx.fillStyle = '#ffb657';
        ctx.fillRect(stage.pad - 16, groundY - 7, 32, 7);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('⇈', stage.pad - 8, groundY - 12);
    }
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#ffe081';
    stage.stars.forEach(([x, y], i) => {
        if (!game.stars.has(game.stage * 3 + i)) ctx.fillText('★', x - 10, y + 8);
    });
    const drone = dronePosition(stage, game.clock);
    if (drone !== undefined) {
        ctx.fillStyle = '#fa6c92';
        ctx.fillRect(drone - 12, 239, 24, 15);
        ctx.fillStyle = '#fff4cb';
        ctx.fillRect(drone - 7, 243, 14, 4);
    }
    ctx.fillStyle = '#ffe081';
    ctx.fillRect(925, 223, 38, 38);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(927, 225, 34, 34);
    ctx.fillStyle = '#221c43';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('?', 936, 252);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('문제 상자', 915, 216);

    const {x, y, facing} = player;
    ctx.fillStyle = '#5cf3bd';
    ctx.fillRect(x + 3, y + 16, 18, 12);
    ctx.fillStyle = '#f5fcff';
    ctx.fillRect(x + 3, y, 19, 17);
    ctx.fillRect(x + 2, y + 26, 8, 4);
    ctx.fillRect(x + 15, y + 26, 8, 4);
    ctx.fillStyle = '#225072';
    ctx.fillRect(x + (facing > 0 ? 10 : 4), y + 4, 11, 8);
    ctx.restore();
}

function openPlatformQuiz() {
    const game = platformGame;
    game.paused = true;
    game.inputs.clear();
    const [question, choices] = questions[game.stage];
    const quiz = document.querySelector('#platform-quiz');
    quiz.hidden = false;
    quiz.innerHTML = `
        <div class="eyebrow platform-kicker">문제 상자 · ${game.stage + 1}</div>
        <h2 tabindex="-1">${question}</h2>
        <div class="answers">${choices.map((choice, i) => `<button type="button" onclick="answerPlatformQuiz(${i},this)">${choice}</button>`).join('')}</div>
        <p id="platform-feedback" role="status"></p>
        <button type="button" id="platform-next" class="primary" hidden onclick="advancePlatform()">${game.stage === platformStages.length - 1 ? '탐험 결과 보기' : '다음 구간으로 →'}</button>`;
    quiz.querySelector('h2').focus();
}

function answerPlatformQuiz(choice, button) {
    const game = platformGame;
    const [, , correct, explanation] = questions[game.stage];
    const feedback = document.querySelector('#platform-feedback');
    if (choice !== correct) {
        if (!game.missed.includes(game.stage)) game.missed.push(game.stage);
        feedback.textContent = '다시 도전해 보세요. ' + explanation;
        button.disabled = true;
        document.querySelector('#platform-quiz .answers button:not(:disabled)').focus();
        return;
    }
    if (!game.missed.includes(game.stage)) game.firstCorrect++;
    feedback.textContent = '정답! ' + explanation;
    document.querySelectorAll('#platform-quiz .answers button').forEach(option => option.disabled = true);
    const next = document.querySelector('#platform-next');
    next.hidden = false;
    next.focus();
}

function advancePlatform() {
    const game = platformGame;
    game.stage++;
    if (game.stage < platformStages.length) {
        showPlatformStage();
        return;
    }
    document.querySelector('#game').innerHTML = `
        <div class="eyebrow platform-kicker">임무 완료</div>
        <h1 tabindex="-1">태양계 탐험을 마쳤습니다!</h1>
        <p>모은 별 <b>${game.stars.size} / 15</b> · 첫 시도 정답 <b>${game.firstCorrect} / ${questions.length}</b></p>
        ${game.missed.length ? `<h2>다시 볼 개념</h2>${game.missed.map(i => `<p><b>${questions[i][0]}</b><br>${questions[i][3]}</p>`).join('')}` : '<p>모든 문제를 첫 시도에 맞혔습니다.</p>'}
        <button class="primary" onclick="beginPlatformGame()">다시 탐험하기</button>`;
    document.querySelector('#game h1').focus();
}
