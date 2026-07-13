import json
import os
import sys
from datetime import datetime, timedelta

from ortools.sat.python import cp_model


def solve_with_minimum_extra_slots(input_data):
    model = cp_model.CpModel()

    interviewer_slots = input_data['interviewerSlots']
    interviewee_slots = input_data.get('intervieweeSlots', [])
    panel_size = input_data['panelSize']

    # 시간대 키 추출 (예: "09/01 14:00~15:00")
    time_keys = sorted(
        list(set(f"{s['interviewDate']} {s['timeSlot']}" for s in interviewer_slots + interviewee_slots)))
    interviewer_ids = sorted(list(set(s['interviewerId'] for s in interviewer_slots)))
    interviewee_ids = sorted(list(set(s['intervieweeId'] for s in interviewee_slots)))

    # 1. 가용성 맵
    inter_avail = {iid: {tk: False for tk in time_keys} for iid in interviewer_ids}
    for s in interviewer_slots:
        inter_avail[s['interviewerId']][f"{s['interviewDate']} {s['timeSlot']}"] = True

    ee_avail = {eid: {tk: False for tk in time_keys} for eid in interviewee_ids}
    for s in interviewee_slots:
        key = f"{s['interviewDate']} {s['timeSlot']}"
        if key in ee_avail[s['intervieweeId']]:
            ee_avail[s['intervieweeId']][key] = True

    # 2. 변수 정의
    x = {}  # 후보자 c가 시간 tk(1시간)에 면접 보는지
    y = {}  # 면접관 i가 시간 tk(1시간)에 투입되는지
    is_forced = {}  # 강제 투입 여부

    for c in interviewee_ids:
        for tk in time_keys:
            x[c, tk] = model.NewBoolVar(f'x_{c}_{tk}')

    for i in interviewer_ids:
        for tk in time_keys:
            y[i, tk] = model.NewBoolVar(f'y_{i}_{tk}')
            is_forced[i, tk] = model.NewBoolVar(f'forced_{i}_{tk}')

    # 3. 제약 조건
    # (1) 후보자는 반드시 1회 면접
    for c in interviewee_ids:
        model.Add(sum(x[c, tk] for tk in time_keys) == 1)

    # (2) [수정] 한 시간대(1시간)에 후보자는 최대 4명까지 가능 (15분씩 4섹션)
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

    # (5) 패널 구성 제약: 후보자가 1명이라도 있는 시간대에는 면접관 panel_size만큼 필요
    for tk in time_keys:
        # 해당 시간대에 면접이 있는지 여부를 나타내는 중간 변수
        has_interview = model.NewBoolVar(f'has_interview_{tk}')
        # 후보자 합이 1 이상이면 has_interview는 1
        model.Add(sum(x[c, tk] for c in interviewee_ids) >= 1).OnlyEnforceIf(has_interview)
        model.Add(sum(x[c, tk] for c in interviewee_ids) == 0).OnlyEnforceIf(has_interview.Not())

        # 면접이 있는 시간대에는 정확히 panel_size만큼의 면접관 할당
        model.Add(sum(y[i, tk] for i in interviewer_ids) == panel_size).OnlyEnforceIf(has_interview)
        model.Add(sum(y[i, tk] for i in interviewer_ids) == 0).OnlyEnforceIf(has_interview.Not())

    # 4. 목적 함수: 추가 슬롯 최소화
    model.Minimize(sum(is_forced[i, tk] for i in interviewer_ids for tk in time_keys))

    # 5. 해결
    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        schedule = []
        extra_slots_needed = []

        # 시간대별로 배정된 후보자들을 그룹화
        for tk in time_keys:
            assigned_candidates = [c for c in interviewee_ids if solver.Value(x[c, tk])]
            if not assigned_candidates:
                continue

            assigned_inters = [int(i) for i in interviewer_ids if solver.Value(y[i, tk])]

            # 시간 파싱 (예: "09/01 14:00~15:00" -> "09/01", "14:00")
            date_str, time_range = tk.split(' ')
            start_time_str = time_range.split('~')[0]

            # 15분 단위로 쪼개기
            base_time = datetime.strptime(start_time_str, "%H:%M")

            for idx, c_id in enumerate(assigned_candidates):
                start_slot = base_time + timedelta(minutes=15 * idx)
                end_slot = start_slot + timedelta(minutes=15)

                slot_string = f"{date_str};{start_slot.strftime('%H:%M')}~{end_slot.strftime('%H:%M')}"

                schedule.append({
                    "intervieweeId": int(c_id),
                    "slot": slot_string,
                    "interviewers": assigned_inters
                })

        # 추가 슬롯 추출
        for i in interviewer_ids:
            for tk in time_keys:
                if solver.Value(is_forced[i, tk]):
                    date, time = tk.split(' ')
                    extra_slots_needed.append({"interviewerId": int(i), "date": date, "timeSlot": time})

        return {
            "status": True,
            "is_perfect": (len(extra_slots_needed) == 0),
            "extra_slots_count": len(extra_slots_needed),
            "extra_slots_needed": extra_slots_needed,
            "schedule": schedule
        }
    else:
        return {"status": False, "message": "해를 찾을 수 없습니다."}


# main 함수는 동일하게 유지 (BASE_DIR 및 입출력 로직)
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

    # 폴더가 없으면 생성
    os.makedirs(os.path.dirname(output_filename), exist_ok=True)

    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    if result["status"] == True:
        print(f"완료! 부족 슬롯: {result['extra_slots_count']}개. 결과: {output_filename}")
    else:
        print(f"실패: {result['message']}")


if __name__ == "__main__":
    main()
