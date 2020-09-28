import moment, { Duration } from "moment";
import {
  TaskBeforeWakeupTimeError,
  TaskAfterBedTimeError,
  TaskDuplicationError,
  TooMuchTaskError,
} from "./TimeSchedulerErrors";

type StaticTask = {
  name: string;
  start: number;
  end: number;
};

type StaticTaskInput = {
  name: string;
  start: Date;
  end: Date;
};

type DynamicTask = {
  name: string;
  duration: Duration;
};

type DynamicTaskInput = {
  name: string;
  minutes: number;
};

type FreeTask = {
  name: string;
  proportion: number;
};

type FreeTaskInput = FreeTask;

type Schedule = {
  name: string;
  start: Date;
  end: Date;
};

export default class TimeScheduler {
  wakeupTime: number;
  bedTime: number;
  staticTasks: StaticTask[];
  dynamicTasks: DynamicTask[];
  freeTasks: FreeTask[];

  constructor(
    wakeupTime: Date,
    bedTime: Date,
    staticTasks: StaticTaskInput[],
    dynamicTasks: DynamicTaskInput[],
    freeTasks: FreeTaskInput[]
  ) {
    this.wakeupTime = moment(wakeupTime).valueOf();
    this.bedTime = moment(bedTime).valueOf();
    this.staticTasks = staticTasks.map((task) => {
      return {
        name: task.name,
        start: moment(task.start).valueOf(),
        end: moment(task.end).valueOf(),
      };
    });
    this.dynamicTasks = dynamicTasks.map((task) => {
      return {
        name: task.name,
        duration: moment.duration(task.minutes, "minutes"),
      };
    });
    this.freeTasks = freeTasks;
  }

  generateSchedule() {
    let schedules: Schedule[] = [];
    schedules = this.setStaticTasks(schedules);
    schedules = this.setDynamicTasks(schedules);
    schedules = this.setFreeTasks(schedules);
    return schedules;
  }

  private setStaticTasks(schedules: Schedule[]) {
    for (let i = 0; i < this.staticTasks.length; i++) {
      const task = this.staticTasks[i];
      // 起床時間と就寝時間の間であるかどうか
      if (task.start < this.wakeupTime) {
        throw new TaskBeforeWakeupTimeError();
      }
      if (task.end > this.bedTime) {
        throw new TaskAfterBedTimeError();
      }
      // 固定タスクごとに時間が重なってないかどうか
      for (let j = 0; j < this.staticTasks.length; j++) {
        if (j === i) continue;
        if (this.checkStaticTaskDuplication(task, this.staticTasks[j])) {
          throw new TaskDuplicationError();
        }
      }
      schedules.push({
        name: task.name,
        start: moment(task.start).toDate(),
        end: moment(task.end).toDate(),
      });
    }
    schedules.sort((a, b) => a.start.getTime() - b.start.getTime());
    return schedules;
  }

  private setDynamicTasks(schedules: Schedule[]) {
    for (let i = 0; i < this.dynamicTasks.length; i++) {
      const task = this.dynamicTasks[i];
      let duration = task.duration.asMilliseconds();
      do {
        const data = this.setDynamicTask(task, duration, schedules);
        schedules = data[0];
        duration = data[1];
        schedules.sort((a, b) => a.start.getTime() - b.start.getTime());
      } while (duration > 0);
    }
    return schedules;
  }

  private setDynamicTask(
    task: DynamicTask,
    duration: number,
    schedules: Schedule[]
  ): [Schedule[], number] {
    // タスクが登録されていれば
    if (schedules.length > 0) {
      const morningDuration =
        moment(schedules[0].start).valueOf() - this.wakeupTime;
      // 起床から一つ目のタスクまでの時間があれば
      if (morningDuration > 0) {
        // タスクが間隔より短ければ
        if (duration <= morningDuration) {
          schedules.push({
            name: task.name,
            start: moment(this.wakeupTime).toDate(),
            end: moment(this.wakeupTime + duration).toDate(),
          });
          return [schedules, 0];
        } else {
          const restTime = duration - morningDuration;
          schedules.push({
            name: task.name,
            start: moment(this.wakeupTime).toDate(),
            end: schedules[0].start,
          });
          return [schedules, restTime];
        }
      } else {
        // タスク間に新タスクを設定する
        for (let i = 0; i < schedules.length - 1; i++) {
          const endOfFirstSchedule = moment(schedules[i].end).valueOf();
          const startOfSecondSchedule = moment(
            schedules[i + 1].start
          ).valueOf();
          const durationBetweenTasks =
            startOfSecondSchedule - endOfFirstSchedule;
          if (durationBetweenTasks > 0) {
            // タスクが間隔より短ければ
            if (duration <= durationBetweenTasks) {
              schedules.push({
                name: task.name,
                start: moment(endOfFirstSchedule).toDate(),
                end: moment(endOfFirstSchedule + duration).toDate(),
              });
              return [schedules, 0];
            } else {
              const restTime = duration - durationBetweenTasks;
              schedules.push({
                name: task.name,
                start: moment(endOfFirstSchedule).toDate(),
                end: schedules[i + 1].start,
              });
              return [schedules, restTime];
            }
          }
        }
        // 最後のタスクから就寝まで時間があれば
        const lastTaskEndTime = moment(
          schedules[schedules.length - 1].end
        ).valueOf();
        const eveningDuration =
          this.bedTime - moment(schedules[schedules.length - 1].end).valueOf();
        if (eveningDuration > 0 && duration <= eveningDuration) {
          schedules.push({
            name: task.name,
            start: schedules[schedules.length - 1].end,
            end: moment(lastTaskEndTime + duration).toDate(),
          });
          return [schedules, 0];
        }
        throw new TooMuchTaskError();
      }
    }
    return [schedules, 0];
  }

  private setFreeTasks(schedules: Schedule[]) {
    const base = Math.floor(
      this.calculateRestTime(schedules) / this.calculateTotalProportion()
    );
    for (let i = 0; i < this.freeTasks.length; i++) {
      const task = this.freeTasks[i];
      let duration = base * task.proportion;
      do {
        const data = this.setFreeTask(task, duration, schedules);
        schedules = data[0];
        duration = data[1];
        schedules.sort((a, b) => a.start.getTime() - b.start.getTime());
      } while (duration > 0);
    }
    return schedules;
  }

  private setFreeTask(
    task: FreeTask,
    duration: number,
    schedules: Schedule[]
  ): [Schedule[], number] {
    // タスクが登録されていれば
    if (schedules.length > 0) {
      const morningDuration =
        moment(schedules[0].start).valueOf() - this.wakeupTime;
      // 起床から一つ目のタスクまでの時間があれば
      if (morningDuration > 0) {
        // タスクが間隔より短ければ
        if (duration <= morningDuration) {
          schedules.push({
            name: task.name,
            start: moment(this.wakeupTime).toDate(),
            end: moment(this.wakeupTime + duration).toDate(),
          });
          return [schedules, 0];
        } else {
          const restTime = duration - morningDuration;
          schedules.push({
            name: task.name,
            start: moment(this.wakeupTime).toDate(),
            end: schedules[0].start,
          });
          return [schedules, restTime];
        }
      } else {
        // タスク間に新タスクを設定する
        for (let i = 0; i < schedules.length - 1; i++) {
          const endOfFirstSchedule = moment(schedules[i].end).valueOf();
          const startOfSecondSchedule = moment(
            schedules[i + 1].start
          ).valueOf();
          const durationBetweenTasks =
            startOfSecondSchedule - endOfFirstSchedule;
          if (durationBetweenTasks > 0) {
            // タスクが間隔より短ければ
            if (duration <= durationBetweenTasks) {
              schedules.push({
                name: task.name,
                start: moment(endOfFirstSchedule).toDate(),
                end: moment(endOfFirstSchedule + duration).toDate(),
              });
              return [schedules, 0];
            } else {
              const restTime = duration - durationBetweenTasks;
              schedules.push({
                name: task.name,
                start: moment(endOfFirstSchedule).toDate(),
                end: schedules[i + 1].start,
              });
              return [schedules, restTime];
            }
          }
        }
        // 最後のタスクから就寝まで時間があれば
        const lastTaskEndTime = moment(
          schedules[schedules.length - 1].end
        ).valueOf();
        const eveningDuration =
          this.bedTime - moment(schedules[schedules.length - 1].end).valueOf();
        if (eveningDuration > 0 && duration <= eveningDuration) {
          schedules.push({
            name: task.name,
            start: schedules[schedules.length - 1].end,
            end: moment(lastTaskEndTime + duration).toDate(),
          });
          return [schedules, 0];
        }
        throw new TooMuchTaskError();
      }
    }
    return [schedules, 0];
  }

  private calculateRestTime(schedules: Schedule[]) {
    // 起床時間から最初のタスクまでの時間を計算
    const morningTime = moment(schedules[0].start).valueOf() - this.wakeupTime;
    // タスク間の時間を計算
    let betweenTime = 0;
    for (let i = 0; i < schedules.length - 1; i++) {
      betweenTime +=
        moment(schedules[i + 1].start).valueOf() -
        moment(schedules[i].end).valueOf();
    }
    // 最終タスクから就寝時間までの時間を計算
    const eveningTime =
      this.bedTime - moment(schedules[schedules.length - 1].end).valueOf();
    return morningTime + betweenTime + eveningTime;
  }

  private calculateTotalProportion() {
    let sum = 0;
    this.freeTasks.forEach((task) => {
      sum += task.proportion;
    });
    return sum;
  }

  private checkStaticTaskDuplication = (
    task1: StaticTask,
    task2: StaticTask
  ) => {
    return (
      (task2.start < task1.start && task1.start < task2.end) ||
      (task2.start < task1.end && task1.end < task2.end)
    );
  };
}
