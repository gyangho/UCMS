import json
import os
import sys
from datetime import datetime, timedelta

from ortools.sat.python import cp_model


def build_model(input_data, extra_slots_limit=None):
    """
    extra_slots_limit이 None이면 Phase 1 (추가 슬롯 최소화),
    정수가 주어지면 Phase 2 (공정성 최적화, 추가 슬롯 수 고정)
    """
    model = cp_model.CpModel()

    interviewer_slots = input_data['interviewerSlots']
    interviewee_slots = input_data.get('intervieweeSlots', [])
    panel_size = input_data['panelSize']

    time_keys = sorted(
        list(set(f"{s['interviewDate']} {s['timeSlot']}" for s in interviewer_slots + interviewee_slots)))
    interviewer_ids = sorted(list(set(s['interviewerId'] for s in interviewer_slots)))
    interviewee_ids = sorted(list(set(s['intervieweeId'] for s in interviewee_slots)))

    # 가용성 맵
    inter_avail = {iid: {tk: False for tk in time_keys} for iid in interviewer_ids}
    for s in interviewer_slots:
        inter_avail[s['interviewerId']][f"{s['interviewDate']} {s['timeSlot']}"] = True

    ee_avail = {eid: {tk: False for tk in time_keys} for eid in interviewee_ids}
    for s in interviewee_slots:
        key = f"{s['interviewDate']} {s['timeSlot']}"
        if key in ee_avail[s['intervieweeId']]:
            ee_avail[s['intervieweeId']][key] = True

    # 변수 정의
    x, y, is_forced = {}, {}, {}

    for c in interviewee_ids:
        for tk in time_keys:
            x[c, tk] = model.NewBoolVar(f'x_{c}_{tk}')

    for i in interviewer_ids:
        for tk in time_keys:
            y[i, tk] = model.NewBoolVar(f'y_{i}_{tk}')
            is_forced[i, tk] = model.NewBoolVar(f'forced_{i}_{tk}')

    # 제약 조건
    # (1) 후보자는 반드시 1회 면접
    for c in interviewee_ids:
        model.Add(sum(x[c, tk] for tk in time_keys) == 1)

    # (2) 한 시간대에 후보자는 최대 4명
    for tk in time_keys:
        model.Add(sum(x[c, tk] for c in interviewee_ids) <= 4)

    # (3) 후보자 가용성 (Hard)
    for c in interviewee_ids:
        for tk in time_keys:
            if not ee_avail[c][tk]:
                model.Add(x[c, tk] == 0)

    # (4) 면접관 가용성 (Soft)
    for i in interviewer_ids:
        for tk in time_keys:
            if not inter_avail[i][tk]:
                model.Add(is_forced[i, tk] >= y[i, tk])
            else:
                model.Add(is_forced[i, tk] == 0)

    # (5) 패널 구성 제약
    for tk in time_keys:
        has_interview = model.NewBoolVar(f'has_interview_{tk}')
        model.Add(sum(x[c, tk] for c in interviewee_ids) >= 1).OnlyEnforceIf(has_interview)
        model.Add(sum(x[c, tk] for c in interviewee_ids) == 0).OnlyEnforceIf(has_interview.Not())
        model.Add(sum(y[i, tk] for i in interviewer_ids) == panel_size).OnlyEnforceIf(has_interview)
        model.Add(sum(y[i, tk] for i in interviewer_ids) == 0).OnlyEnforceIf(has_interview.Not())

    # 면접관별 총 배정 횟수
    max_slots = len(time_keys)
    interview_count = {}
    for i in interviewer_ids:
        count_var = model.NewIntVar(0, max_slots, f'count_{i}')
        model.Add(count_var == sum(y[i, tk] for tk in time_keys))
        interview_count[i] = count_var

    total_forced = sum(is_forced[i, tk] for i in interviewer_ids for tk in time_keys)

    if extra_slots_limit is None:
        # ✅ Phase 1: 추가 슬롯 최소화
        model.Minimize(total_forced)
    else:
        # ✅ Phase 2: 추가 슬롯 수 고정 + 공정성 하드 제약 적용
        model.Add(total_forced == extra_slots_limit)

        # 핵심: 모든 면접관 쌍의 배정 횟수 차이를 최대 1로 강제
        for i in interviewer_ids:
            for j in interviewer_ids:
                if i < j:
                    model.Add(interview_count[i] - interview_count[j] <= 1)
                    model.Add(interview_count[j] - interview_count[i] <= 1)

        # 목적 함수: max - min 최소화 (하드 제약이 주이지만 추가로 최적화)
        max_count = model.NewIntVar(0, max_slots, 'max_count')
        min_count = model.NewIntVar(0, max_slots, 'min_count')
        model.AddMaxEquality(max_count, list(interview_count.values()))
        model.AddMinEquality(min_count, list(interview_count.values()))
        model.Minimize(max_count - min_count)

    return model, x, y, is_forced, interview_count, time_keys, interviewer_ids, interviewee_ids


def solve_with_minimum_extra_slots(input_data):
    # ── Phase 1: 최소 추가 슬롯 수 계산 ──────────────────────────────
    model1, x1, y1, forced1, _, time_keys, interviewer_ids, interviewee_ids = \
        build_model(input_data)

    solver1 = cp_model.CpSolver()
    status1 = solver1.Solve(model1)

    if status1 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": "FAILED", "message": "Phase 1: 해를 찾을 수 없습니다."}

    min_extra = int(solver1.ObjectiveValue())
    print(f"[Phase 1] 최소 추가 슬롯: {min_extra}")

    # ── Phase 2: 추가 슬롯 고정 후 공정성 최적화 ──────────────────────
    model2, x2, y2, forced2, interview_count2, time_keys, interviewer_ids, interviewee_ids = \
        build_model(input_data, extra_slots_limit=min_extra)

    solver2 = cp_model.CpSolver()
    status2 = solver2.Solve(model2)

    if status2 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Phase 2 실패 시 Phase 1 결과로 폴백
        print("[Phase 2] 공정 분배 불가 → Phase 1 결과 사용")
        solver_f, x_f, y_f, forced_f = solver1, x1, y1, forced1
        interview_count_f = None
    else:
        print(f"[Phase 2] 공정성 gap: {int(solver2.ObjectiveValue())}")
        solver_f, x_f, y_f, forced_f = solver2, x2, y2, forced2
        interview_count_f = interview_count2

    # ── 결과 조합 ─────────────────────────────────────────────────────
    schedule = []
    extra_slots_needed = []

    for tk in time_keys:
        assigned_candidates = [c for c in interviewee_ids if solver_f.Value(x_f[c, tk])]
        if not assigned_candidates:
            continue

        assigned_inters = [int(i) for i in interviewer_ids if solver_f.Value(y_f[i, tk])]
        date_str, time_range = tk.split(' ')
        start_time_str = time_range.split('~')[0]
        base_time = datetime.strptime(start_time_str, "%H:%M")

        for idx, c_id in enumerate(assigned_candidates):
            start_slot = base_time + timedelta(minutes=15 * idx)
            end_slot = start_slot + timedelta(minutes=15)
            slot_string = f"{date_str} {start_slot.strftime('%H:%M')}~{end_slot.strftime('%H:%M')}"
            schedule.append({
                "intervieweeId": int(c_id),
                "slot": slot_string,
                "interviewers": assigned_inters
            })

    for i in interviewer_ids:
        for tk in time_keys:
            if solver_f.Value(forced_f[i, tk]):
                date, time = tk.split(' ')
                extra_slots_needed.append({"interviewerId": int(i), "date": date, "timeSlot": time})

    interviewer_counts = {}
    if interview_count_f:
        interviewer_counts = {int(i): solver_f.Value(interview_count_f[i]) for i in interviewer_ids}
    else:
        for i in interviewer_ids:
            interviewer_counts[int(i)] = sum(
                1 for tk in time_keys if solver_f.Value(y_f[i, tk])
            )

    counts = list(interviewer_counts.values())
    fairness_gap = max(counts) - min(counts) if counts else 0

    return {
        "status": "SUCCESS",
        "is_perfect": (len(extra_slots_needed) == 0),
        "extra_slots_count": len(extra_slots_needed),
        "extra_slots_needed": extra_slots_needed,
        "schedule": schedule,
        "interviewer_counts": interviewer_counts,
        "fairness_gap": fairness_gap
    }


def main():
    file_num = "00"
    if len(sys.argv) > 1:
        file_num = sys.argv[1]

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    input_filename = os.path.join(BASE_DIR, "inputs", f"input_{file_num}.json")
    output_filename = os.path.join(BASE_DIR, "outputs", f"output_{file_num}.json")

    if not os.path.exists(input_filename):
        print(f"File not found: {input_filename}")
        return

    with open(input_filename, 'r', encoding='utf-8') as f:
        data = json.load(f)

    result = solve_with_minimum_extra_slots(data)

    os.makedirs(os.path.dirname(output_filename), exist_ok=True)
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    if result["status"] == "SUCCESS":
        print(f"완료! 부족 슬롯: {result['extra_slots_count']}개 | 공정성 gap: {result['fairness_gap']}")
        print(f"면접관별 배정 횟수: {result['interviewer_counts']}")
    else:
        print(f"실패: {result['message']}")


if __name__ == "__main__":
    main()
