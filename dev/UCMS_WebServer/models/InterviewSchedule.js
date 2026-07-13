const db = require("./db");

class InterviewSchedule {
    static createInterviewSchedule = async (planId, scheduleData) => {
        const {intervieweeId, slot, interviewers} = scheduleData;

        // slot에서 날짜와 시간 분리 (예: "2024-01-15;09:00-10:00" -> "2024-01-15", "09:00-10:00")
        let interviewDate, timeSlot;
        if (slot.includes(";")) {
            [interviewDate, timeSlot] = slot.split(";");
        } else {
            // slot이 날짜와 시간이 합쳐진 형태인 경우
            interviewDate = slot;
            timeSlot = slot;
        }

        // 각 면접관에 대해 면접 스케줄 생성
        const results = [];
        for (const interviewerId of interviewers) {
            // MySQL에서는 RETURNING을 지원하지 않으므로 INSERT 후 SELECT 실행
            await db.query(
                `INSERT INTO interview_schedules (plan_id, interview_date, time_slot, interviewer_id, interviewee_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    planId,
                    interviewDate,
                    timeSlot,
                    interviewerId,
                    intervieweeId,
                ]
            );

            // INSERT된 데이터 조회
            const [insertedRows] = await db.query(
                `SELECT *
                 FROM interview_schedules
                 WHERE plan_id = ?
                   AND interview_date = ?
                   AND time_slot = ?
                   AND interviewer_id = ?
                   AND interviewee_id = ?
                 ORDER BY id DESC LIMIT 1`,
                [
                    planId,
                    interviewDate,
                    timeSlot,
                    interviewerId,
                    intervieweeId,
                ]
            );

            if (insertedRows.length > 0) {
                results.push(insertedRows[0]);
            }
        }

        return results;
    };

    static getInterviewSchedule = async (planId) => {
        const [interviewSchedule] = await db.query(
            `SELECT s.*,
                    m.name  as interviewer_name,
                    rm.name as interviewee_name,
                    rm.response_id,
                    rm.form_id,
                    rm.rating
             FROM interview_schedules s
                      LEFT JOIN members m ON s.interviewer_id = m.student_id
                      LEFT JOIN recruiting_members rm ON s.interviewee_id = rm.student_id
             WHERE s.plan_id = ?
             ORDER BY s.interview_date, s.time_slot, s.interviewer_id`,
            [planId]
        );
        return interviewSchedule;
    };

    // 면접 스케줄을 날짜/시간별로 그룹화하여 조회
    static getGroupedInterviewSchedule = async (planId) => {
        const [interviewSchedule] = await db.query(
            `SELECT s.*,
                    m.name  as interviewer_name,
                    rm.name as interviewee_name,
                    rm.rating
             FROM interview_schedules s
                      LEFT JOIN members m ON s.interviewer_id = m.student_id
                      LEFT JOIN recruiting_members rm ON s.interviewee_id = rm.student_id
             WHERE s.plan_id = ?
             ORDER BY s.interview_date, s.time_slot, s.interviewer_id`,
            [planId]
        );

        // 날짜와 시간별로 그룹화
        const groupedSchedule = {};

        interviewSchedule.forEach((schedule) => {
            const key = `${schedule.interview_date}_${schedule.time_slot}`;

            if (!groupedSchedule[key]) {
                groupedSchedule[key] = {
                    interview_date: schedule.interview_date,
                    time_slot: schedule.time_slot,
                    interviewees: [],
                    interviewers: [],
                };
            }

            // 피면접자 정보 추가 (중복 방지)
            const existingInterviewee = groupedSchedule[
                key
                ].interviewees.find(
                (item) => item.id === schedule.interviewee_id
            );
            if (!existingInterviewee) {
                groupedSchedule[key].interviewees.push({
                    id: schedule.interviewee_id,
                    name: schedule.interviewee_name || schedule.interviewee_id,
                    rating: schedule.rating,
                });
            }

            // 면접관 정보 추가 (중복 방지)
            const existingInterviewer = groupedSchedule[
                key
                ].interviewers.find(
                (item) => item.id === schedule.interviewer_id
            );
            if (!existingInterviewer) {
                groupedSchedule[key].interviewers.push({
                    id: schedule.interviewer_id,
                    name: schedule.interviewer_name || schedule.interviewer_id,
                });
            }
        });

        // 배열로 변환하고 정렬
        return Object.values(groupedSchedule).sort((a, b) => {
            // 날짜 순으로 정렬
            const dateA = new Date(a.interview_date);
            const dateB = new Date(b.interview_date);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA.getTime() - dateB.getTime();
            }
            // 같은 날짜면 시간 순으로 정렬
            return a.time_slot.localeCompare(b.time_slot);
        });
    };

    static deleteInterviewSchedule = async (planId) => {
        await db.query(
            `DELETE
             FROM interview_schedules
             WHERE plan_id = ?`,
            [planId]
        );
    };
}

module.exports = InterviewSchedule;
