/**
 * Zero-ON 법정의무연수 이수 관리 · Google Apps Script 백엔드
 * DB: 이 스크립트가 연결된 Google 스프레드시트
 *
 * 처음 한 번: 편집기에서 setup 함수를 실행하세요.
 *   - 시트(설정·교원명단·연수목록·이수기록·변경기록)를 만들고
 *   - 연수 목록 기본값을 채우고
 *   - 담당자 처음 비밀번호를 1234로 정합니다(담당자 화면 ⚙️ 설정에서 바꾸세요).
 * 그다음 [배포 → 새 배포 → 웹 앱] (실행: 나, 액세스: 모든 사용자)로 배포하고
 * 나온 /exec 주소를 프론트엔드 assets/config.js 의 API_URL 에 넣습니다.
 */

var SHEETS = {
  settings: '설정',
  teachers: '교원명단',
  trainings: '연수목록',
  records: '이수기록',
  log: '변경기록',
  requests: '추가요청'
};

var HEAD = {
  teachers: ['교사ID', '이름', '신분', '부서', '집계', '비밀번호해시', '등록일', '수정일'],
  trainings: ['교육ID', '교육명', '짧은 이름', '주기·시간', '세부 조건', '수강 링크', '대상', '사용', '순서'],
  records: ['연도', '교사ID', '이름', '교육ID', '이수', '이수일', '이수번호', '메모', '기록시각'],
  log: ['시각', '누가', '무엇', '내용'],
  requests: ['요청ID', '요청시각', '이름', '부서', '신분', '메모', '상태', '처리일'],
  settings: ['항목', '값', '설명']
};

var SEED = [
 {
  "id": "EDU_ACTIVITY",
  "name": "교육활동 침해행위 예방교육",
  "cycle": "매년 1회",
  "detail": "교직원용 예방·대응 등 교육내용을 갖춘 연 1회 실적. 학교 자체교육 또는 인정 원격교육을 반영한다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EA%B5%90%EC%9C%A1%ED%99%9C%EB%8F%99",
  "target": "대상",
  "short": "교육활동 보호"
 },
 {
  "id": "CHARACTER",
  "name": "인성교육",
  "cycle": "매년 1시간 이상",
  "detail": "교원 대상 연 1시간 이상. 적정 학교 자체연수도 계획·참석·결과 증빙으로 반영할 수 있다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%9D%B8%EC%84%B1",
  "target": "대상",
  "short": "인성교육"
 },
 {
  "id": "SCHOOL_VIOLENCE_S1",
  "name": "학교폭력 예방교육 (1학기)",
  "cycle": "1학기 1회",
  "detail": "1학기와 2학기를 따로 기록한다. 통합 수료 1건은 해당 학기의 1회분이며 양 학기에 중복 산입하지 않는다. 늦은 수강으로 지난 학기 실적을 소급 생성하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%ED%95%99%EA%B5%90%ED%8F%AD%EB%A0%A5",
  "target": "대상",
  "short": "학교폭력 예방(1학기)"
 },
 {
  "id": "SCHOOL_VIOLENCE_S2",
  "name": "학교폭력 예방교육 (2학기)",
  "cycle": "2학기 1회",
  "detail": "1학기와 2학기를 따로 기록한다. 통합 수료 1건은 해당 학기의 1회분이며 양 학기에 중복 산입하지 않는다. 늦은 수강으로 지난 학기 실적을 소급 생성하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%ED%95%99%EA%B5%90%ED%8F%AD%EB%A0%A5",
  "target": "대상",
  "short": "학교폭력 예방(2학기)"
 },
 {
  "id": "SCHOOL_SAFETY",
  "name": "학교안전교육",
  "cycle": "2024.3.1~2027.2.28 중 15시간",
  "detail": "주기 내 이전 학교 이수를 합산할 수 있다. 7대 영역 중 3개 이상 또는 7대 영역 단일과정, 재난 유형별 대비훈련 조건을 함께 확인한다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%95%88%EC%A0%84%ED%95%9C%20%ED%95%99%EA%B5%90",
  "target": "대상",
  "short": "학교안전"
 },
 {
  "id": "PRECEDING_EDU",
  "name": "선행교육 및 선행학습 예방 교육",
  "cycle": "평택 기준 매년 1회",
  "detail": "법령은 정기 실시를 정하고, 2026 평택 초등 장학 점검표가 연 1회 이상을 명시한다(중·고는 학교급 점검표 확인). 법령에 없는 최소 1시간을 새로 부과하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%84%A0%ED%96%89",
  "target": "대상",
  "short": "선행교육 예방"
 },
 {
  "id": "BASIC_LEARNING",
  "name": "기초학력 보장",
  "cycle": "2023~2026학년도 중 한 해 15시간",
  "detail": "일반 담임·교과교사도 대상이다. 2023.3.1~2027.2.28 주기 안에서 이수연도와 해당 연도 15시간을 확인한다. 4년간 소량씩 누적한 15시간을 자동 인정하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EA%B8%B0%EC%B4%88%ED%95%99%EB%A0%A5",
  "target": "대상",
  "short": "기초학력"
 },
 {
  "id": "FIRST_AID",
  "name": "심폐소생술 등 응급처치 교육",
  "cycle": "매학년도 4시간 · 실습 2시간 포함",
  "detail": "원칙 이론 2시간+실습 2시간. 교육여건 조정 시에도 실습 2시간을 포함한 최소 3시간이어야 한다. 실습시간·강사 조건과 학교 인정 증빙을 확인한다. 원격 이론만으로 완료 처리하지 않는다.",
  "url": "https://www.redcross.or.kr/learn/edu/edu_card.do?educode1=01&educode2=17&orgcode=106",
  "target": "대상",
  "short": "응급처치·CPR"
 },
 {
  "id": "ANTI_CORRUPTION",
  "name": "부패방지교육",
  "cycle": "매년 1회 · 2시간 이상",
  "detail": "적격 청렴교육의 실제 인정시간 2시간 이상. 청탁금지·이해충돌·행동강령 내용이 포함되면 같은 적격 통합교육으로 함께 관리할 수 있으며 시간을 4배로 합산하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%B2%AD%EB%A0%B4",
  "target": "대상",
  "short": "부패방지"
 },
 {
  "id": "ANTI_GRAFT",
  "name": "부정청탁 금지 및 금품등의 수수 금지 교육",
  "cycle": "매년 1회",
  "detail": "해당 법령 내용이 포함된 청렴 통합교육으로 연 1회를 반영할 수 있다. 독립적인 최소 1시간·2시간 기준은 없다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%B2%AD%ED%83%81",
  "target": "대상",
  "short": "청탁금지"
 },
 {
  "id": "CONFLICT_INTEREST",
  "name": "공직자의 이해충돌방지법 교육",
  "cycle": "매년 1회",
  "detail": "해당 법령 내용이 포함된 청렴 통합교육으로 연 1회를 반영할 수 있다. 별도 법정 최소시간은 정해져 있지 않다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%9D%B4%ED%95%B4%EC%B6%A9%EB%8F%8C",
  "target": "대상",
  "short": "이해충돌 방지"
 },
 {
  "id": "CODE_CONDUCT",
  "name": "공무원 행동강령 교육",
  "cycle": "매년 1회 · 신규임용 시 별도",
  "detail": "적용되는 경기 행동강령 내용을 포함한 교육으로 연 1회를 기록한다. 별도 연간 최소시간은 정해져 있지 않다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%ED%96%89%EB%8F%99%EA%B0%95%EB%A0%B9",
  "target": "대상",
  "short": "공무원 행동강령"
 },
 {
  "id": "EMERGENCY_WELFARE",
  "name": "긴급복지 신고의무자 교육",
  "cycle": "매년 1시간 이상",
  "detail": "당해 연도 복지부 제공 자료를 사용한 인정교육과 실제 인정시간을 확인한다. 적정 개인 원격교육 및 같은 해 이전 기관 이수증을 사용할 수 있다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EA%B8%B4%EA%B8%89%EB%B3%B5%EC%A7%80",
  "target": "대상",
  "short": "긴급복지 신고"
 },
 {
  "id": "CHILD_ABUSE",
  "name": "아동학대 신고의무자 교육",
  "cycle": "매년 1시간 이상",
  "detail": "복지부 제공·승인 자료 또는 인정 위탁기관 교육을 반영한다. 개인 원격 및 같은 해 이전 기관 이수증을 사용할 수 있다. 신고·공공부문 예방 중복대상도 적정 통합교육 연 1시간으로 가능하다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%95%84%EB%8F%99%ED%95%99%EB%8C%80",
  "target": "대상",
  "short": "아동학대 신고"
 },
 {
  "id": "DISABILITY_ABUSE",
  "name": "장애인학대 및 장애인 대상 성범죄 예방 교육",
  "cycle": "매년 1시간 이상",
  "detail": "장애인학대 및 장애인 대상 성범죄 신고의무교육의 법정 내용을 확인한다. 적법한 아동·노인 신고교육과 통합 실시할 수 있으나 일반 장애인식개선교육으로 자동 대체하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%9E%A5%EC%95%A0%EC%9D%B8%ED%95%99%EB%8C%80",
  "target": "대상",
  "short": "장애인학대 신고"
 },
 {
  "id": "DISABILITY_SOCIAL",
  "name": "장애인식개선교육(사회적 인식개선)",
  "cycle": "매년 1회 · 1시간 이상",
  "detail": "개인의 적정 온라인 1시간 이수는 반영할 수 있다. 대면 연 1회는 기관 운영 조건으로 별도 관리하며 모든 개인에게 추가 대면교육을 부과하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%9E%A5%EC%95%A0%EC%9D%B8%EC%8B%9D",
  "target": "대상",
  "short": "사회적 장애인식개선"
 },
 {
  "id": "MULTICULTURAL",
  "name": "다문화이해교육",
  "cycle": "당해 연도 포함 최근 3년 15시간",
  "detail": "경기 관리기준의 최근 3년·15시간으로 관리한다. NEIS 등재 및 다문화·상호문화·이주배경학생·문화다양성 인정 키워드를 확인한다. 매년 15시간 재수강 또는 고정 2026~2028 주기로 계산하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EB%8B%A4%EB%AC%B8%ED%99%94",
  "target": "대상",
  "short": "다문화 이해"
 },
 {
  "id": "FOUR_VIOLENCE",
  "name": "성희롱·성폭력·성매매·가정폭력 예방교육",
  "cycle": "매년 각 영역 1시간 · 총 4시간",
  "detail": "성희롱·성폭력·성매매·가정폭력 각 영역 연 1회·1시간을 구분한다. 일반교사는 인정 사이버교육 가능. 기관의 영역별 대면 실시 조건은 개인 전원 대면조건과 분리한다.",
  "url": "https://www.kigepe.or.kr/elearning/user/violenceprevent/EnrolmentApplyForm.do",
  "target": "대상",
  "short": "4대폭력 예방"
 },
 {
  "id": "INFO_DISCLOSURE",
  "name": "정보공개 제도 운영에 관한 교육",
  "cycle": "매년 1회",
  "detail": "공공기관 소속 공무원·임직원 전체 대상이다. 인정된 해당 주제 교육 연 1회를 기록한다. 정보공개 담당자만 대상으로 좁히거나 최소 1시간을 새로 부과하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%A0%95%EB%B3%B4%EA%B3%B5%EA%B0%9C",
  "target": "대상",
  "short": "정보공개"
 },
 {
  "id": "DISABILITY_WORK",
  "name": "직장 내 장애인 인식개선 교육",
  "cycle": "대상 근로자: 매년 1회 · 1시간",
  "detail": "정규 공립교원·국가·지방공무원은 개인 교육대상에서 제외한다. 학교의 사업주 교육 운영 책임과 관리자의 개인 수강대상을 구분한다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%A7%81%EC%9E%A5%20%EB%82%B4%20%EC%9E%A5%EC%95%A0%EC%9D%B8",
  "target": "대상 제외",
  "short": "직장 내 장애인식개선"
 },
 {
  "id": "SUICIDE_PREVENTION",
  "name": "자살예방교육",
  "cycle": "매년 1회",
  "detail": "해당 연도 승인·교육청 인정 프로그램을 이수한다. 전국 법령은 연 1회이며 고정 1시간을 정하지 않는다. 고양의 1시간 기준을 평택 공통 최소시간으로 확대하지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%9E%90%EC%82%B4",
  "target": "대상",
  "short": "자살예방"
 },
 {
  "id": "INFECTION_PREVENTION",
  "name": "감염병 예방교육",
  "cycle": "매년 1회 · 1시간 이상",
  "detail": "정규 공립교원 대상 연 1회·1시간 이상. 집합·인터넷교육 가능하며 실제 인정시간과 수료 실적을 확인한다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EA%B0%90%EC%97%BC",
  "target": "대상",
  "short": "감염병 예방"
 },
 {
  "id": "HUMAN_RIGHTS",
  "name": "인권교육",
  "cycle": "매년 서로 다른 교육 2회",
  "detail": "교직원 학생인권 관련 연수 연 2회. 통합 수료는 1회로만 반영한다. 수료증 1건의 두 챕터를 2회로 세지 않는다. 학생의 학기당 2시간을 교직원 시수로 옮기지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%9D%B8%EA%B6%8C",
  "target": "대상",
  "short": "인권교육"
 },
 {
  "id": "PRIVACY",
  "name": "개인정보보호 교육",
  "cycle": "매년 1회 · 1시간 이상 권고",
  "detail": "학생정보 등을 처리하는 교원 대상(초등 기준). 학교 자체교육 실적을 우선 반영한다. 최소 1시간은 경기 감사의 권고값이며 법정 최소시간으로 강제하지 않는다. 남부 통합과정에는 포함되지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4",
  "target": "대상",
  "short": "개인정보보호"
 },
 {
  "id": "INFORMATION_SECURITY",
  "name": "정보보안 교육",
  "cycle": "매년 1회 · 1시간 이상 권고",
  "detail": "경기 정보보안 지침에 따른 전 직원 교육을 연 1회 관리한다. 학교 자체교육 실적을 우선 반영한다. 최소 1시간은 감사의 권고값이며 법정 최소시간으로 강제하지 않는다. 남부 통합과정에는 포함되지 않는다.",
  "url": "https://www.gtie.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000005185&srchCrseNm=%EC%A0%95%EB%B3%B4%EB%B3%B4%EC%95%88",
  "target": "대상",
  "short": "정보보안"
 }
];

var TOKEN_TTL = 6 * 60 * 60; // 6시간
var DEFAULT_PW = '1234';   // 선생님·담당자 처음 비밀번호 (바꾸도록 안내)
var MAX_FAIL = 5;            // 비밀번호 연속 실패 허용 횟수
var LOCK_SEC = 10 * 60;      // 잠금 시간

/* ───────────── 설치 ───────────── */

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (k) {
    var sh = ss.getSheetByName(SHEETS[k]) || ss.insertSheet(SHEETS[k]);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold').setBackground('#eef2ff');
      sh.setFrozenRows(1);
    }
  });
  var st = ss.getSheetByName(SHEETS.settings);
  if (st.getLastRow() < 2) {
    st.getRange(2, 1, 3, 3).setValues([
      ['학교명', '우리 학교', '화면 위쪽에 표시됩니다'],
      ['연도', schoolYear_(), '이수기록을 나누는 학년도 (3월~이듬해 2월)'],
      ['안내문', '수료증을 받은 뒤 이수 여부를 표시해 주세요.', '선생님 화면 위쪽 안내']
    ]);
  }
  var tr = ss.getSheetByName(SHEETS.trainings);
  if (tr.getLastRow() < 2) {
    var rows = SEED.map(function (t, i) {
      return [t.id, t.name, t.short, t.cycle, t.detail, t.url, t.target, t.target === '대상 제외' ? 'N' : 'Y', i + 1];
    });
    tr.getRange(2, 1, rows.length, HEAD.trainings.length).setValues(rows);
  }
  var tch = ss.getSheetByName(SHEETS.teachers);
  tch.getRange('A:A').setNumberFormat('@');
  ss.getSheetByName(SHEETS.records).getRange('B:B').setNumberFormat('@');
  ss.getSheetByName(SHEETS.records).getRange('F:G').setNumberFormat('@');

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', DEFAULT_PW);
  var sheet1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
  Logger.log('설치 완료. 담당자 비밀번호: ' + props.getProperty('ADMIN_PASSWORD'));
  Logger.log('처음 비밀번호(1234)는 담당자 화면의 ⚙️ 설정에서 꼭 바꿔 주세요.');
}

/* ───────────── 웹 앱 진입점 ───────────── */

function doGet() {
  return json_({ ok: true, app: 'zero-on', message: '이 주소는 API입니다. 화면은 GitHub Pages 주소로 여세요.' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents || '{}'); }
  catch (err) { return json_({ ok: false, error: '요청 형식이 올바르지 않습니다.' }); }
  try {
    var fn = ROUTES[body.action];
    if (!fn) throw new Error('알 수 없는 요청입니다: ' + body.action);
    var data = fn(body);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err), candidates: err && err.candidates });
  }
}

var ROUTES = {
  ping: function () { return { school: setting_('학교명'), year: year_(), notice: setting_('안내문') }; },

  /* 선생님 */
  // 이름 + 비밀번호. 같은 이름이 여럿이면 id로 다시 요청합니다.
  teacherLogin: function (b) {
    var t = findTeacher_(b);
    checkLock_(t.id);
    if (!t.pinHash) {
      // 아직 본인 비밀번호가 없으면 처음 비밀번호(1234)로만 들어와서 새 비밀번호를 정합니다
      if (String(b.password || '') !== DEFAULT_PW) fail_(t.id, '처음 비밀번호는 1234입니다.');
      CacheService.getScriptCache().remove('fail_' + t.id);
      return { needSet: true, id: t.id, name: t.name };
    }
    if (hash_(t.id, b.password) !== t.pinHash) fail_(t.id, '비밀번호가 맞지 않습니다.');
    CacheService.getScriptCache().remove('fail_' + t.id);
    return { token: issue_({ role: 'teacher', id: t.id }), teacher: pub_(t) };
  },
  // 처음 로그인(1234) 뒤 본인 비밀번호 정하기 (이미 있으면 거절)
  teacherSetPassword: function (b) {
    var pw = String(b.password || '');
    if (pw.length < 4 || pw.length > 30) throw new Error('비밀번호는 4~30자로 정해 주세요.');
    if (pw === DEFAULT_PW) throw new Error('1234가 아닌 다른 비밀번호로 정해 주세요.');
    return withLock_(function () {
      var t = teacherById_(b.id);
      if (!t.included) throw new Error('NOT_FOUND: 명단에 없습니다.');
      if (t.pinHash) throw new Error('이미 비밀번호가 있습니다. 잊으셨다면 담당자에게 초기화를 요청하세요.');
      checkLock_(t.id);
      if (String(b.current || '') !== DEFAULT_PW) fail_(t.id, '처음 비밀번호는 1234입니다.');
      setTeacherCell_(t.row, '비밀번호해시', hash_(t.id, pw));
      CacheService.getScriptCache().remove('fail_' + t.id);
      log_(t.name, '비밀번호 설정', t.id);
      return { token: issue_({ role: 'teacher', id: t.id }), teacher: pub_(t) };
    });
  },
  // 명단에 없는 교원이 담당자에게 추가를 요청
  requestAdd: function (b) {
    var name = clean_(b.name).slice(0, 20);
    if (!name) throw new Error('이름을 입력해 주세요.');
    var c = CacheService.getScriptCache();
    if (c.get('req_' + name)) throw new Error('이미 요청했습니다. 담당자가 확인할 때까지 기다려 주세요.');
    return withLock_(function () {
      var pending = requests_().filter(function (r) { return r.status === '대기'; });
      if (pending.length >= 50) throw new Error('대기 중인 요청이 많습니다. 담당자에게 직접 알려 주세요.');
      if (pending.some(function (r) { return r.name === name; })) throw new Error('이미 요청했습니다. 담당자가 확인할 때까지 기다려 주세요.');
      var id = 'R' + new Date().getTime().toString(36).toUpperCase();
      sheet_('requests').appendRow([id, new Date(), name, clean_(b.dept).slice(0, 30), clean_(b.role).slice(0, 20), clean_(b.memo).slice(0, 200), '대기', '']);
      c.put('req_' + name, '1', 600);
      log_(name, '추가 요청', clean_(b.dept));
      return { id: id };
    });
  },
  myDashboard: function (b) {
    var s = auth_(b.token, 'teacher');
    var t = teacherById_(s.id);
    var y = year_();
    var recs = records_().filter(function (r) { return r.year === y && r.teacherId === t.id; });
    return { teacher: pub_(t), year: y, school: setting_('학교명'), notice: setting_('안내문'), trainings: trainings_(true), records: recs.map(pubRec_) };
  },
  saveRecord: function (b) {
    var s = auth_(b.token, 'teacher');
    var t = teacherById_(s.id);
    var tr = trainings_(true).filter(function (x) { return x.id === b.trainingId; })[0];
    if (!tr) throw new Error('연수 항목을 찾을 수 없습니다.');
    var date = String(b.date || '').trim();
    var cert = clean_(b.certNo);
    if (b.done) {
      var bad = checkRecord_(date, cert);
      if (bad) throw new Error(bad);
    }
    return withLock_(function () {
      var rec = upsertRecord_(t, tr.id, !!b.done, date, cert.slice(0, 60), clean_(b.memo).slice(0, 200));
      log_(t.name, b.done ? '이수 표시' : '미이수로 변경', tr.name);
      return pubRec_(rec);
    });
  },

  /* 담당자 */
  adminLogin: function (b) {
    var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    checkLock_('admin');
    if (!pw || String(b.password || '') !== pw) fail_('admin', '비밀번호가 맞지 않습니다.');
    CacheService.getScriptCache().remove('fail_admin');
    return { token: issue_({ role: 'admin' }), defaultPw: pw === DEFAULT_PW };
  },
  adminDashboard: function (b) {
    auth_(b.token, 'admin');
    var y = year_();
    return {
      year: y, school: setting_('학교명'), notice: setting_('안내문'),
      defaultPw: PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') === DEFAULT_PW,
      teachers: teachers_().map(pub_),
      trainings: trainings_(false),
      records: records_().filter(function (r) { return r.year === y; }).map(pubRec_),
      requests: requests_().filter(function (r) { return r.status === '대기'; }).map(function (r) { return { id: r.id, at: r.at, name: r.name, dept: r.dept, role: r.role, memo: r.memo }; })
    };
  },
  resolveRequest: function (b) {
    auth_(b.token, 'admin');
    return withLock_(function () {
      var r = requests_().filter(function (x) { return x.id === b.id; })[0];
      if (!r) throw new Error('요청을 찾을 수 없습니다.');
      if (r.status !== '대기') throw new Error('이미 처리한 요청입니다.');
      var result = null;
      if (b.approve) result = importRoster_([{ id: '', name: r.name, role: clean_(b.role || r.role), dept: clean_(b.dept || r.dept) }], false);
      var sh = sheet_('requests');
      sh.getRange(r.row, 7, 1, 2).setValues([[b.approve ? '추가' : '거절', today_()]]);
      log_('담당자', b.approve ? '추가 요청 승인' : '추가 요청 거절', r.name);
      return { id: r.id, approved: !!b.approve, result: result };
    });
  },
  importRoster: function (b) {
    auth_(b.token, 'admin');
    var rows = (b.rows || []).map(function (r) {
      return { id: clean_(r.id).toUpperCase(), name: clean_(r.name), role: clean_(r.role), dept: clean_(r.dept) };
    }).filter(function (r) { return r.name; });
    if (!rows.length) throw new Error('업로드할 이름이 없습니다.');
    if (rows.length > 500) throw new Error('한 번에 500명까지 올릴 수 있습니다.');
    return withLock_(function () { return importRoster_(rows, !!b.excludeMissing); });
  },
  setTeacherStatus: function (b) {
    auth_(b.token, 'admin');
    return withLock_(function () {
      var t = teacherById_(b.id);
      var v = b.included ? '포함' : '제외';
      setTeacherCell_(t.row, '집계', v);
      setTeacherCell_(t.row, '수정일', today_());
      log_('담당자', '집계 ' + v, t.name + ' (' + t.id + ')');
      return { id: t.id, included: !!b.included };
    });
  },
  resetPassword: function (b) {
    auth_(b.token, 'admin');
    return withLock_(function () {
      var t = teacherById_(b.id);
      setTeacherCell_(t.row, '비밀번호해시', '');
      CacheService.getScriptCache().remove('fail_' + t.id);
      log_('담당자', '비밀번호 초기화', t.name + ' (' + t.id + ')');
      return { id: t.id };
    });
  },
  setTrainingActive: function (b) {
    auth_(b.token, 'admin');
    return withLock_(function () {
      var sh = sheet_('trainings'), vals = sh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === b.id) {
          sh.getRange(i + 1, HEAD.trainings.indexOf('사용') + 1).setValue(b.active ? 'Y' : 'N');
          log_('담당자', '연수 ' + (b.active ? '사용' : '숨김'), vals[i][1]);
          return { id: b.id, active: !!b.active };
        }
      }
      throw new Error('연수 항목을 찾을 수 없습니다.');
    });
  },
  // 연수 항목 추가(id 없음) 또는 수정(id 있음)
  saveTraining: function (b) {
    auth_(b.token, 'admin');
    var f = {
      name: clean_(b.name).slice(0, 80), short: clean_(b.short).slice(0, 30), cycle: clean_(b.cycle).slice(0, 60),
      detail: String(b.detail == null ? '' : b.detail).trim().slice(0, 500), url: clean_(b.url).slice(0, 500)
    };
    if (!f.name) throw new Error('교육명을 입력해 주세요.');
    if (!f.cycle) throw new Error('주기·시간을 입력해 주세요. 예: 매년 1회');
    if (f.url && !/^https?:\/\/\S+$/.test(f.url)) throw new Error('수강 링크는 http:// 또는 https:// 로 시작해야 합니다.');
    return withLock_(function () {
      var sh = sheet_('trainings'), vals = sh.getDataRange().getValues();
      var col = function (k) { return HEAD.trainings.indexOf(k) + 1; };
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][1]) === f.name && String(vals[i][0]) !== String(b.id || '')) throw new Error('같은 이름의 연수가 이미 있습니다.');
      }
      if (b.id) {
        for (var j = 1; j < vals.length; j++) {
          if (String(vals[j][0]) === b.id) {
            sh.getRange(j + 1, col('교육명'), 1, 5).setValues([[f.name, f.short || f.name, f.cycle, f.detail, f.url]]);
            log_('담당자', '연수 수정', f.name);
            return { id: b.id };
          }
        }
        throw new Error('연수 항목을 찾을 수 없습니다.');
      }
      var maxOrder = vals.slice(1).reduce(function (m, v) { return Math.max(m, Number(v[8]) || 0); }, 0);
      var id = 'CUSTOM_' + new Date().getTime().toString(36).toUpperCase();
      sh.appendRow([id, f.name, f.short || f.name, f.cycle, f.detail, f.url, '대상', 'Y', maxOrder + 1]);
      log_('담당자', '연수 추가', f.name);
      return { id: id };
    });
  },
  // 직접 추가한 연수만, 이수 기록이 없을 때 삭제
  deleteTraining: function (b) {
    auth_(b.token, 'admin');
    if (String(b.id || '').indexOf('CUSTOM_') !== 0) throw new Error('기본 연수는 삭제할 수 없습니다. 숨김으로 바꿔 주세요.');
    return withLock_(function () {
      if (records_().some(function (r) { return r.trainingId === b.id; })) throw new Error('이수 기록이 있는 연수는 삭제할 수 없습니다. 숨김으로 바꿔 주세요.');
      var sh = sheet_('trainings'), vals = sh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === b.id) { sh.deleteRow(i + 1); log_('담당자', '연수 삭제', vals[i][1]); return { id: b.id }; }
      }
      throw new Error('연수 항목을 찾을 수 없습니다.');
    });
  },
  // 학교명·학년도·안내문·담당자 비밀번호
  saveSettings: function (b) {
    auth_(b.token, 'admin');
    var school = clean_(b.school).slice(0, 40), year = String(b.year || '').trim(), notice = String(b.notice == null ? '' : b.notice).trim().slice(0, 200);
    if (!school) throw new Error('학교명을 입력해 주세요.');
    if (!/^\d{4}$/.test(year) || Number(year) < 2020 || Number(year) > 2100) throw new Error('학년도는 2026처럼 네 자리 숫자로 입력해 주세요.');
    var props = PropertiesService.getScriptProperties();
    var changePw = !!(b.newPassword || b.currentPassword);
    if (changePw) {
      checkLock_('admin');
      if (String(b.currentPassword || '') !== props.getProperty('ADMIN_PASSWORD')) fail_('admin', '현재 비밀번호가 맞지 않습니다.');
      var np = String(b.newPassword || '');
      if (np.length < 4 || np.length > 40) throw new Error('새 비밀번호는 4~40자로 정해 주세요.');
    }
    return withLock_(function () {
      setSetting_('학교명', school, '화면 위쪽에 표시됩니다');
      setSetting_('연도', year, '이수기록을 나누는 학년도 (3월~이듬해 2월)');
      setSetting_('안내문', notice, '선생님 화면 위쪽 안내');
      if (changePw) { props.setProperty('ADMIN_PASSWORD', String(b.newPassword)); CacheService.getScriptCache().remove('fail_admin'); }
      log_('담당자', '설정 변경', school + ' · ' + year + '학년도' + (changePw ? ' · 비밀번호 변경' : ''));
      return { school: school, year: year, notice: notice, passwordChanged: changePw };
    });
  }
};

/* ───────────── 명단 반영 ───────────── */

function importRoster_(rows, excludeMissing) {
  var sh = sheet_('teachers');
  var list = teachers_();
  var byId = {}, byName = {};
  list.forEach(function (t) { byId[t.id] = t; (byName[t.name] = byName[t.name] || []).push(t); });
  var seen = {}, added = [], updated = [], restored = [], skipped = [];
  var nextNo = list.reduce(function (m, t) { var n = parseInt(String(t.id).replace(/\D/g, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
  var appendRows = [];
  var today = today_();

  rows.forEach(function (r) {
    var t = null;
    if (r.id && byId[r.id] && byId[r.id].name === r.name) t = byId[r.id];
    else if (byName[r.name]) {
      var same = byName[r.name];
      if (same.length === 1) t = same[0];
      else {
        var hit = same.filter(function (x) { return r.dept && x.dept === r.dept; });
        if (hit.length === 1) t = hit[0];
        else { skipped.push(r.name + ' (같은 이름 ' + same.length + '명 · 부서나 교사ID로 구분해 주세요)'); return; }
      }
    }
    if (t) {
      if (seen[t.id]) { skipped.push(r.name + ' (파일 안에서 중복)'); return; }
      seen[t.id] = true;
      var changed = false;
      if (r.role && r.role !== t.role) { setTeacherCell_(t.row, '신분', r.role); changed = true; }
      if (r.dept && r.dept !== t.dept) { setTeacherCell_(t.row, '부서', r.dept); changed = true; }
      if (!t.included) { setTeacherCell_(t.row, '집계', '포함'); restored.push(t.name); changed = true; }
      if (changed) { setTeacherCell_(t.row, '수정일', today); if (t.included) updated.push(t.name); }
    } else {
      nextNo++;
      var id = 'T' + ('000' + nextNo).slice(-3);
      seen[id] = true;
      appendRows.push([id, r.name, r.role, r.dept, '포함', '', today, today]);
      added.push(r.name);
    }
  });
  if (appendRows.length) sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, HEAD.teachers.length).setValues(appendRows);

  var excluded = [];
  if (excludeMissing) {
    list.forEach(function (t) {
      if (!seen[t.id] && t.included) { setTeacherCell_(t.row, '집계', '제외'); setTeacherCell_(t.row, '수정일', today); excluded.push(t.name); }
    });
  }
  log_('담당자', '명단 업로드', '신규 ' + added.length + ' · 변경 ' + updated.length + ' · 복원 ' + restored.length + ' · 제외 ' + excluded.length + ' · 건너뜀 ' + skipped.length);
  return { added: added, updated: updated, restored: restored, excluded: excluded, skipped: skipped };
}

/* ───────────── 데이터 읽기·쓰기 ───────────── */

function sheet_(k) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS[k]);
  if (!sh) throw new Error('시트가 없습니다. 편집기에서 setup 함수를 먼저 실행해 주세요.');
  return sh;
}

function teachers_() {
  var vals = sheet_('teachers').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (!v[0] || !v[1]) continue;
    out.push({ row: i + 1, id: String(v[0]).trim(), name: String(v[1]).trim(), role: String(v[2] || ''), dept: String(v[3] || ''), included: String(v[4]) !== '제외', pinHash: String(v[5] || '') });
  }
  return out;
}

function findTeacher_(b) {
  var name = clean_(b.name);
  if (!name) throw new Error('이름을 입력해 주세요.');
  var list = teachers_().filter(function (t) { return t.name === name && t.included; });
  if (b.id) list = list.filter(function (t) { return t.id === String(b.id); });
  if (!list.length) throw new Error('NOT_FOUND: 명단에 없는 이름입니다.');
  if (list.length > 1) {
    var err = new Error('MULTI: 같은 이름이 ' + list.length + '명 있습니다. 본인을 골라 주세요.');
    err.candidates = list.map(function (t) { return { id: t.id, hint: [t.dept, t.role].filter(String).join(' · ') || t.id }; });
    throw err;
  }
  return list[0];
}

function requests_() {
  var vals = sheet_('requests').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (!v[0]) continue;
    out.push({ row: i + 1, id: String(v[0]), at: v[1] ? new Date(v[1]).toISOString() : '', name: String(v[2]), dept: String(v[3] || ''), role: String(v[4] || ''), memo: String(v[5] || ''), status: String(v[6] || '대기') });
  }
  return out;
}

function teacherById_(id) {
  var t = teachers_().filter(function (x) { return x.id === String(id || ''); })[0];
  if (!t) throw new Error('명단에서 찾을 수 없습니다. 담당자에게 문의해 주세요.');
  return t;
}

function setTeacherCell_(row, col, value) {
  sheet_('teachers').getRange(row, HEAD.teachers.indexOf(col) + 1).setValue(value);
}

function pub_(t) { return { id: t.id, name: t.name, role: t.role, dept: t.dept, included: t.included, hasPin: !!t.pinHash }; }

function trainings_(onlyActive) {
  var vals = sheet_('trainings').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (!v[0]) continue;
    var t = { id: String(v[0]), name: String(v[1]), short: String(v[2] || v[1]), cycle: String(v[3] || ''), detail: String(v[4] || ''), url: String(v[5] || ''), target: String(v[6] || '대상'), active: String(v[7]).toUpperCase() !== 'N', order: Number(v[8]) || i };
    if (onlyActive && !t.active) continue;
    out.push(t);
  }
  return out.sort(function (a, b) { return a.order - b.order; });
}

function records_() {
  var vals = sheet_('records').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (!v[1]) continue;
    out.push({ row: i + 1, year: String(v[0]), teacherId: String(v[1]), trainingId: String(v[3]), done: v[4] === true || String(v[4]).toUpperCase() === 'TRUE' || v[4] === '완료', date: fmtDate_(v[5]), certNo: String(v[6] || ''), memo: String(v[7] || ''), at: v[8] ? new Date(v[8]).toISOString() : '' });
  }
  return out;
}

function pubRec_(r) { return { teacherId: r.teacherId, trainingId: r.trainingId, done: r.done, date: r.date, certNo: r.certNo, memo: r.memo, at: r.at }; }

function upsertRecord_(t, trainingId, done, date, certNo, memo) {
  var sh = sheet_('records');
  var y = year_();
  var now = new Date();
  var hit = records_().filter(function (r) { return r.year === y && r.teacherId === t.id && r.trainingId === trainingId; })[0];
  var row = [y, t.id, t.name, trainingId, done ? '완료' : '미이수', done ? date : '', done ? certNo : '', memo, now];
  if (hit) sh.getRange(hit.row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  return { teacherId: t.id, trainingId: trainingId, done: done, date: row[5], certNo: row[6], memo: memo, at: now.toISOString() };
}

/* ───────────── 인증 ───────────── */

function issue_(payload) {
  var token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify(payload), TOKEN_TTL);
  return token;
}

function auth_(token, role) {
  var raw = token && CacheService.getScriptCache().get('tok_' + token);
  if (!raw) throw new Error('AUTH: 로그인 시간이 지났습니다. 다시 로그인해 주세요.');
  var s = JSON.parse(raw);
  if (s.role !== role) throw new Error('AUTH: 권한이 없습니다.');
  return s;
}

function hash_(id, pin) {
  var salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + id + '|' + String(pin || ''), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function checkLock_(key) {
  var n = Number(CacheService.getScriptCache().get('fail_' + key) || 0);
  if (n >= MAX_FAIL) throw new Error('여러 번 틀려서 10분 동안 잠겼습니다. 잠시 뒤 다시 시도해 주세요.');
}

function fail_(key, msg) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get('fail_' + key) || 0) + 1;
  c.put('fail_' + key, String(n), LOCK_SEC);
  var left = MAX_FAIL - n;
  throw new Error((msg || '비밀번호가 맞지 않습니다.') + (left > 0 ? ' (남은 기회 ' + left + '번)' : ' 10분 동안 잠겼습니다.'));
}

/* ───────────── 도움 함수 ───────────── */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function setting_(key) {
  var vals = sheet_('settings').getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) if (String(vals[i][0]) === key) return String(vals[i][1]);
  return '';
}

function setSetting_(key, value, desc) {
  var sh = sheet_('settings'), vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value, desc || '']);
}

function year_() { return setting_('연도') || String(schoolYear_()); }

function schoolYear_() {
  var d = new Date();
  var y = Number(Utilities.formatDate(d, 'Asia/Seoul', 'yyyy'));
  var m = Number(Utilities.formatDate(d, 'Asia/Seoul', 'M'));
  return m <= 2 ? y - 1 : y;
}

function today_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }

function fmtDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(v);
}

// 완료로 저장하려면 이수일·이수번호가 모두 올바라야 합니다 (화면 검사와 같은 기준)
function checkRecord_(date, cert) {
  if (!date) return '이수일을 입력해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '이수일은 2026-10-10 형식입니다.';
  var p = date.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
  if (d.getFullYear() !== p[0] || d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) return '이수일 형식이 올바르지 않습니다.';
  if (date > today_()) return '오늘 이후 날짜는 입력할 수 없습니다.';
  if (date < '2020-01-01') return '2020년 이후 날짜만 입력할 수 있습니다.';
  if (!cert) return '이수번호를 입력해 주세요.';
  if (cert.length < 2 || cert.length > 60) return '이수번호는 2~60자입니다.';
  if (!/\d/.test(cert)) return '이수번호에는 숫자가 들어가야 합니다.';
  if (!/^[0-9A-Za-z가-힣][0-9A-Za-z가-힣\-_.\/()#: ]*$/.test(cert)) return '이수번호에 쓸 수 없는 문자가 있습니다.';
  return '';
}

function clean_(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

function log_(who, what, detail) {
  try { sheet_('log').appendRow([new Date(), who, what, detail]); } catch (e) { /* 기록 실패는 무시 */ }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
