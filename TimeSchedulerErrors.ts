export class TaskBeforeWakeupTimeError extends Error {
  constructor() {
    super();
    this.name = "TaskBeforeWakeup";
  }
}

export class TaskAfterBedTimeError extends Error {
  constructor() {
    super();
    this.name = "TaskAfterBedTime";
  }
}

export class TaskDuplicationError extends Error {
  constructor() {
    super();
    this.name = "TaskDuplication";
  }
}

export class TooMuchTaskError extends Error {
  constructor() {
    super();
    this.name = "TooMuchTaskError";
  }
}
