# -*- coding: utf-8 -*-
import os
import sys
import time
import queue
import unicodedata
from collections import defaultdict

import cv2
import numpy as np
import serial
import serial.tools.list_ports
from ultralytics import YOLO

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    Image = None
    ImageDraw = None
    ImageFont = None

from PyQt5.QtCore import Qt, QThread, pyqtSignal, QSize, QUrl
from PyQt5.QtGui import QImage, QPixmap, QDesktopServices
from PyQt5.QtWidgets import (
    QApplication,
    QWidget,
    QPushButton,
    QTextEdit,
    QLineEdit,
    QLabel,
    QComboBox,
    QFileDialog,
    QMessageBox,
    QVBoxLayout,
    QHBoxLayout,
    QGridLayout,
    QSizePolicy,
    QCheckBox,
)


DEFAULT_MODEL_DIR = r"C:\Users\Nguyen Van Quan\Desktop\MAY BAN HANG TU DONG CUOI KY\ALL CODE\yolov8s_hinhanhban2\weights"
DEFAULT_MODEL = os.path.join(DEFAULT_MODEL_DIR, "best.pt")
MANAGEMENT_WEB_URL = "https://vending-machine-cloud.vercel.app"
AUTO_ROI_WIDTH_RATIO = 0.85
AUTO_ROI_HEIGHT_RATIO = 0.75
CAMERA_VIEW_WIDTH = 1280
CAMERA_VIEW_HEIGHT = 720
CAMERA_VIEW_RATIO = CAMERA_VIEW_WIDTH / CAMERA_VIEW_HEIGHT
CAMERA_PREVIEW_WIDTH = 800
CAMERA_PREVIEW_HEIGHT = 380
CAMERA_PREVIEW_RATIO = CAMERA_PREVIEW_WIDTH / CAMERA_PREVIEW_HEIGHT
CAMERA_PREVIEW_MIN_WIDTH = 360
CAMERA_PREVIEW_MIN_HEIGHT = 180

CLASS_TO_VALUE = {
    "10K": 10000,
    "20K": 20000,
    "50K": 50000,
    "100K": 100000,
    "200K": 200000,
    "500K": 500000,
    "class_0": 10000,
    "class_1": 20000,
    "class_2": 50000,
    "class_3": 100000,
    "class_4": 200000,
    "class_5": 500000,
}

CLASS_DISPLAY_NAME = {
    "10K": "10K",
    "20K": "20K",
    "50K": "50K",
    "100K": "100K",
    "200K": "200K",
    "500K": "500K",
    "class_0": "10K",
    "class_1": "20K",
    "class_2": "50K",
    "class_3": "100K",
    "class_4": "200K",
    "class_5": "500K",
}

MONEY_CLASSES = ["10K", "20K", "50K", "100K", "200K", "500K"]
TEXT_FONT_CACHE = {}


SERIAL_LOG_SILENT_PREFIXES = (
    "#CLOUD",
    "#WIFI",
    "#HEAP:",
    "#CFG:",
    "#OK:CLOUD_SP:",
    "#OK:SETGIA:",
    "#OK:SETSL:",
    "Nhan tien:",
)
SERIAL_LOG_SILENT_LINES = {
    "#CLOUD_TASK:START",
    "#CLOUD_TASK:RUN",
}


def should_log_serial_line(line):
    if line in SERIAL_LOG_SILENT_LINES:
        return False
    return not line.startswith(SERIAL_LOG_SILENT_PREFIXES)


def format_money(value):
    return f"{value:,}".replace(",", ".")


def strip_accents(text):
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return without_marks.replace("Đ", "D").replace("đ", "d")


def get_text_font(size):
    if size in TEXT_FONT_CACHE:
        return TEXT_FONT_CACHE[size]

    font = None
    if ImageFont is not None:
        for font_path in (
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ):
            try:
                font = ImageFont.truetype(font_path, size)
                break
            except Exception:
                pass

        if font is None:
            font = ImageFont.load_default()

    TEXT_FONT_CACHE[size] = font
    return font


def draw_frame_text(frame, text, origin, font_size, color_bgr, thickness=2):
    if Image is None or ImageDraw is None:
        cv2.putText(
            frame,
            strip_accents(text),
            origin,
            cv2.FONT_HERSHEY_SIMPLEX,
            max(0.5, font_size / 32.0),
            color_bgr,
            thickness,
        )
        return

    x, y = origin
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(rgb)
    draw = ImageDraw.Draw(image)
    font = get_text_font(font_size)
    color_rgb = (color_bgr[2], color_bgr[1], color_bgr[0])
    draw.text(
        (x, max(0, y - font_size)),
        text,
        font=font,
        fill=color_rgb,
        stroke_width=max(0, thickness - 1),
        stroke_fill=color_rgb,
    )
    frame[:] = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)


def score_to_percent(score, threshold):
    if threshold <= 0:
        return 0.0
    return min(100.0, score * 100.0 / threshold)


def box_inside_roi(box_xyxy, roi):
    x1, y1, x2, y2 = box_xyxy
    roi_x, roi_y, roi_w, roi_h = roi
    return (
        x1 >= roi_x and
        y1 >= roi_y and
        x2 <= roi_x + roi_w and
        y2 <= roi_y + roi_h
    )


def best_detection_in_roi(result, roi, min_conf):
    best_name = None
    best_conf = 0.0
    best_box = None

    for box in result.boxes:
        conf = float(box.conf[0])
        cls_id = int(box.cls[0])
        name = result.names[cls_id]

        if name not in CLASS_TO_VALUE:
            continue

        if conf < min_conf:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        if not box_inside_roi((x1, y1, x2, y2), roi):
            continue

        if conf > best_conf:
            best_name = name
            best_conf = conf
            best_box = (int(x1), int(y1), int(x2), int(y2))

    return best_name, best_conf, best_box


def auto_center_roi(width, height):
    roi_w = int(width * AUTO_ROI_WIDTH_RATIO)
    roi_h = int(height * AUTO_ROI_HEIGHT_RATIO)
    roi_x = (width - roi_w) // 2
    roi_y = (height - roi_h) // 2
    return roi_x, roi_y, roi_w, roi_h


def crop_frame_to_ratio(frame, target_ratio):
    height, width = frame.shape[:2]
    current_ratio = width / height

    if abs(current_ratio - target_ratio) < 0.01:
        return frame

    if current_ratio > target_ratio:
        new_width = int(height * target_ratio)
        x = (width - new_width) // 2
        return frame[:, x:x + new_width]

    new_height = int(width / target_ratio)
    y = (height - new_height) // 2
    return frame[y:y + new_height, :]


def frame_to_qimage(frame):
    frame = crop_frame_to_ratio(frame, CAMERA_VIEW_RATIO)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    h, w, ch = rgb.shape
    return QImage(rgb.data, w, h, ch * w, QImage.Format_RGB888).copy()


class DetectWorker(QThread):
    logSignal = pyqtSignal(str)
    frameSignal = pyqtSignal(QImage)
    statusSignal = pyqtSignal(str)
    scoreSignal = pyqtSignal(dict, dict, str, float, float)
    resultSignal = pyqtSignal(str, int, float, float)
    invalidSignal = pyqtSignal(str)
    resetResultSignal = pyqtSignal()
    productConfigSignal = pyqtSignal(int, int, int)
    stoppedSignal = pyqtSignal()

    def __init__(self, config):
        super().__init__()
        self.config = config
        self.running = True
        self.detecting = False
        self.pending_start_time = 0
        self.score = defaultdict(float)
        self.conf_total = defaultdict(float)
        self.conf_count = defaultdict(int)
        self.detect_start = 0
        self.last_frame_time = 0
        self.sent_this_bill = False
        self.bill_seen = False
        self.timeout_logged = False
        self.command_queue = queue.Queue()

    def stop(self):
        self.running = False

    def send_command(self, command):
        self.command_queue.put(command)

    def log(self, text):
        self.logSignal.emit(text)

    def run(self):
        ser = None
        cap = None

        try:
            self.statusSignal.emit("LOADING MODEL")
            self.log("Đang tải YOLO model...")
            model = YOLO(self.config["model_path"])
            self.log(f"Class model: {model.names}")

            self.statusSignal.emit("CONNECTING")
            self.log(f"Mở COM {self.config['port']} @ {self.config['baud']}...")
            ser = serial.Serial(self.config["port"], self.config["baud"], timeout=0.03)
            time.sleep(2)

            self.statusSignal.emit("CAMERA")
            self.log(f"Mở camera {self.config['camera']}...")
            cap = cv2.VideoCapture(self.config["camera"], cv2.CAP_DSHOW)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_VIEW_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_VIEW_HEIGHT)

            if not cap.isOpened():
                raise RuntimeError("Không mở được camera")

            ok, frame = cap.read()
            if not ok:
                raise RuntimeError("Không đọc được camera")

            frame = crop_frame_to_ratio(frame, CAMERA_VIEW_RATIO)
            height, width = frame.shape[:2]
            roi = auto_center_roi(width, height)

            self.log(f"Camera: {width}x{height}")
            self.log(f"ROI: {roi[0]},{roi[1]},{roi[2]},{roi[3]}")
            self.statusSignal.emit("WAIT #START")
            ser.write(b"#GETCFG\r\n")
            ser.flush()

            while self.running:
                self.read_esp32(ser)
                self.write_pending_commands(ser)

                ok, frame = cap.read()
                if not ok:
                    continue

                frame = crop_frame_to_ratio(frame, CAMERA_VIEW_RATIO)
                now = time.time()
                view = frame.copy()
                x, y, w, h = roi
                cv2.rectangle(view, (x, y), (x + w, y + h), (0, 220, 255), 2)

                if self.detecting and now >= self.pending_start_time:
                    self.process_detection_frame(model, frame, view, roi, ser, now)
                elif self.detecting:
                    pass
                else:
                    draw_frame_text(
                        view,
                        "Đang chờ ESP32 gửi #START",
                        (20, 40),
                        28,
                        (0, 255, 0),
                        2,
                    )

                self.emit_frame(view)

        except Exception as e:
            self.log(f"ERROR: {e}")
            self.statusSignal.emit("ERROR")

        finally:
            if cap is not None:
                cap.release()

            if ser is not None:
                try:
                    if ser.is_open:
                        ser.close()
                except Exception:
                    pass

            self.stoppedSignal.emit()

    def read_esp32(self, ser):
        try:
            while ser.in_waiting:
                line = ser.readline().decode(errors="ignore").strip()

                if not line:
                    continue

                if should_log_serial_line(line):
                    self.log(f"RX: {line}")

                if line.startswith("#CFG:"):
                    try:
                        sp_text, price_text, stock_text = line[5:].split(",")[:3]
                        self.productConfigSignal.emit(int(sp_text), int(price_text), int(stock_text))
                    except Exception:
                        self.log(f"Không đọc được cấu hình sản phẩm: {line}")
                elif line == "#START":
                    self.start_detecting()
                elif line == "#END":
                    self.stop_detecting_by_end()

        except Exception as e:
            self.log(f"Read COM error: {e}")

    def write_pending_commands(self, ser):
        while not self.command_queue.empty():
            command = self.command_queue.get()
            packet = f"#{command}\r\n"
            ser.write(packet.encode())
            ser.flush()
            if command != "GETCFG":
                self.log(f"TX: {packet.strip()}")

    def start_detecting(self):
        self.detecting = True
        self.sent_this_bill = False
        self.bill_seen = False
        self.timeout_logged = False
        self.score.clear()
        self.conf_total.clear()
        self.conf_count.clear()
        self.pending_start_time = time.time() + self.config["settle"]
        self.detect_start = 0
        self.last_frame_time = 0
        self.statusSignal.emit("DETECTING")
        self.resetResultSignal.emit()

    def stop_detecting_by_end(self):
        if not self.detecting:
            return

        self.detecting = False
        self.statusSignal.emit("WAIT #START")
        if self.sent_this_bill:
            pass
        else:
            self.invalidSignal.emit("TIỀN KHÔNG HỢP LỆ")

    def process_detection_frame(self, model, frame, view, roi, ser, now):
        result = model.predict(frame, conf=self.config["min_conf"], verbose=False)[0]
        name, conf, box_xyxy = best_detection_in_roi(result, roi, self.config["min_conf"])
        if name is not None:
            name = CLASS_DISPLAY_NAME.get(name, name)
            x1, y1, x2, y2 = box_xyxy
            cv2.rectangle(view, (x1, y1), (x2, y2), (80, 255, 80), 2)
            confidence_text = f"{conf * 100:.0f}%"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.7
            thickness = 2
            text_size, baseline = cv2.getTextSize(confidence_text, font, font_scale, thickness)
            text_w, text_h = text_size
            text_x = x1
            text_y = max(text_h + 8, y1 - 8)
            bg_x2 = min(view.shape[1] - 1, text_x + text_w + 8)
            bg_y1 = max(0, text_y - text_h - baseline - 6)
            cv2.rectangle(view, (text_x, bg_y1), (bg_x2, text_y + baseline + 2), (80, 255, 80), -1)
            cv2.putText(
                view,
                confidence_text,
                (text_x + 4, text_y),
                font,
                font_scale,
                (20, 40, 20),
                thickness,
            )
        if not self.bill_seen:
            if name is None:
                return

            self.bill_seen = True
            self.detect_start = now
            self.last_frame_time = now
            self.conf_total[name] += conf
            self.conf_count[name] += 1
            return

        dt = max(0, now - self.last_frame_time)
        self.last_frame_time = now

        if name is not None:
            add_score = (conf * conf) * dt
            self.score[name] += add_score
            self.conf_total[name] += conf
            self.conf_count[name] += 1

        best_name, best_score, second_score = self.get_best_score()
        gap = best_score - second_score

        confidence_percent = self.get_confidence_percent()
        self.scoreSignal.emit(confidence_percent, dict(self.score), best_name or "", best_score, gap)

        enough_score = best_score >= self.config["score_threshold"]
        enough_gap = gap >= self.config["gap_threshold"]

        if best_name and enough_score and enough_gap and not self.sent_this_bill:
            value = CLASS_TO_VALUE[best_name]
            packet = f"#HOPLE:{value}\r\n"
            ser.write(packet.encode())
            ser.flush()

            self.sent_this_bill = True
            best_confidence_percent = confidence_percent.get(best_name, 0.0)
            self.resultSignal.emit(best_name, value, best_score, best_confidence_percent)
            self.log(f"TX: {packet.strip()}")

        if now - self.detect_start >= self.config["max_time"] and not self.timeout_logged:
            self.timeout_logged = True

    def get_best_score(self):
        best_name = None
        best_score = 0.0
        second_score = 0.0

        for name, value in self.score.items():
            if value > best_score:
                second_score = best_score
                best_score = value
                best_name = name
            elif value > second_score:
                second_score = value

        return best_name, best_score, second_score

    def get_confidence_percent(self):
        confidence_percent = {}

        for name, total in self.conf_total.items():
            count = self.conf_count.get(name, 0)
            if count > 0:
                confidence_percent[name] = min(100.0, max(0.0, total * 100.0 / count))

        return confidence_percent

    def emit_frame(self, frame):
        self.frameSignal.emit(frame_to_qimage(frame))


class CameraPreviewWorker(QThread):
    frameSignal = pyqtSignal(QImage)
    logSignal = pyqtSignal(str)
    stoppedSignal = pyqtSignal()

    def __init__(self, camera):
        super().__init__()
        self.camera = camera
        self.running = True

    def stop(self):
        self.running = False

    def run(self):
        cap = None

        try:
            cap = cv2.VideoCapture(self.camera, cv2.CAP_DSHOW)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_VIEW_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_VIEW_HEIGHT)

            if not cap.isOpened():
                raise RuntimeError("Không mở được camera preview")

            while self.running:
                ok, frame = cap.read()
                if ok:
                    frame = crop_frame_to_ratio(frame, CAMERA_VIEW_RATIO)
                    self.frameSignal.emit(frame_to_qimage(frame))

                self.msleep(30)

        except Exception as e:
            self.logSignal.emit(f"Lỗi camera preview: {e}")

        finally:
            if cap is not None:
                cap.release()

            self.stoppedSignal.emit()


class CameraViewLabel(QLabel):
    def __init__(self, text=""):
        super().__init__(text)
        self.aspect_ratio = CAMERA_PREVIEW_RATIO
        self.setScaledContents(False)

    def hasHeightForWidth(self):
        return True

    def heightForWidth(self, width):
        return int(width / self.aspect_ratio)

    def sizeHint(self):
        return QSize(CAMERA_PREVIEW_WIDTH, CAMERA_PREVIEW_HEIGHT)

    def minimumSizeHint(self):
        return QSize(CAMERA_PREVIEW_MIN_WIDTH, CAMERA_PREVIEW_MIN_HEIGHT)


class VendingMoneyApp(QWidget):
    def __init__(self):
        super().__init__()
        self.worker = None
        self.preview_worker = None
        self.roi = None
        self.camera_preview_enabled = False
        self.last_port_count = None
        self.last_log_group = None
        self.model_path = DEFAULT_MODEL
        self.init_ui()
        self.load_com_ports()

    def section(self, title_text):
        panel = QWidget()
        panel.setObjectName("panel")

        layout = QVBoxLayout(panel)
        layout.setContentsMargins(18, 14, 18, 18)
        layout.setSpacing(10)

        title = QLabel(title_text)
        title.setObjectName("sectionTitle")
        layout.addWidget(title)

        return panel, layout

    def make_button(self, text, kind="default"):
        button = QPushButton(text)
        button.setCursor(Qt.PointingHandCursor)
        button.setFixedHeight(44)
        button.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        button.setProperty("kind", kind)
        return button

    def make_metric(self, title, value):
        box = QWidget()
        box.setObjectName("metricBox")

        layout = QVBoxLayout(box)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(4)

        lbl_title = QLabel(title)
        lbl_title.setObjectName("metricTitle")

        lbl_value = QLabel(value)
        lbl_value.setObjectName("metricValue")
        lbl_value.setAlignment(Qt.AlignCenter)

        layout.addWidget(lbl_title)
        layout.addWidget(lbl_value)

        return box, lbl_value

    def init_ui(self):
        self.setWindowTitle("Nhóm 1-Máy bán hàng tự động")
        self.resize(1600, 900)
        self.setMinimumSize(1280, 720)

        self.setStyleSheet("""
            QWidget {
                background-color: #eef2f5;
                color: #1f2933;
                font-family: Segoe UI, Arial;
                font-size: 16px;
            }
            QWidget#panel {
                background-color: #ffffff;
                border: 1px solid #d7dee7;
                border-radius: 8px;
            }
            QWidget#metricBox {
                background-color: #f8fafc;
                border: 1px solid #d0d5dd;
                border-radius: 8px;
            }
            QLabel#appTitle {
                color: #111827;
                font-size: 32px;
                font-weight: 900;
            }
            QLabel#subTitle {
                color: #667085;
                font-size: 16px;
                font-weight: 600;
            }
            QLabel#sectionTitle {
                color: #344054;
                font-size: 18px;
                font-weight: 800;
                padding-bottom: 4px;
                border-bottom: 1px solid #e4e7ec;
            }
            QLabel#metricTitle {
                color: #667085;
                font-size: 14px;
                font-weight: 800;
            }
            QLabel#metricValue {
                color: #111827;
                font-size: 24px;
                font-weight: 900;
            }
            QLabel#cameraView {
                background-color: #f8fafc;
                border: 1px solid #d0d5dd;
                border-radius: 8px;
                color: #667085;
                font-size: 22px;
                font-weight: 800;
            }
            QLineEdit, QComboBox {
                min-height: 36px;
                max-height: 36px;
                padding: 2px 8px;
                border: 1px solid #cfd6df;
                border-radius: 6px;
                background-color: #ffffff;
                color: #111827;
                font-size: 16px;
            }
            QTextEdit {
                border: 1px solid #cfd6df;
                border-radius: 6px;
                background-color: #0f172a;
                color: #d1fae5;
                font-family: Consolas, Segoe UI;
                font-size: 14px;
            }
            QPushButton {
                min-height: 44px;
                max-height: 44px;
                padding: 0 10px;
                border: 1px solid #cfd6df;
                border-radius: 6px;
                background-color: #f8fafc;
                color: #1f2933;
                font-weight: 800;
            }
            QPushButton:hover {
                background-color: #e8f0fe;
                border-color: #8ab4f8;
            }
            QPushButton:disabled {
                background-color: #cbd5e1;
                color: #64748b;
            }
            QPushButton[kind="primary"] {
                background-color: #2563eb;
                border-color: #2563eb;
                color: white;
            }
            QPushButton[kind="success"] {
                background-color: #16a34a;
                border-color: #16a34a;
                color: white;
            }
            QPushButton[kind="warning"] {
                background-color: #f59e0b;
                border-color: #f59e0b;
                color: #111827;
            }
            QPushButton[kind="danger"] {
                background-color: #dc2626;
                border-color: #dc2626;
                color: white;
            }
            QCheckBox {
                font-weight: 700;
            }
        """)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(22, 18, 22, 18)
        main_layout.setSpacing(14)

        header_layout = QHBoxLayout()
        header_text = QVBoxLayout()

        title = QLabel("Máy bán hàng tự động")
        title.setObjectName("appTitle")
        header_text.addWidget(title)
        header_layout.addLayout(header_text)
        header_layout.addStretch()

        self.lbl_status = QLabel("OFFLINE")
        self.lbl_status.setObjectName("metricValue")
        self.lbl_status.setAlignment(Qt.AlignCenter)
        self.lbl_status.setFixedSize(220, 72)
        self.lbl_status.setStyleSheet("""
            background-color:#fee2e2;
            color:#991b1b;
            border:1px solid #fecaca;
            border-radius:8px;
            font-size:28px;
            font-weight:900;
        """)
        header_layout.addWidget(self.lbl_status)
        main_layout.addLayout(header_layout)

        content_layout = QHBoxLayout()
        content_layout.setSpacing(14)
        main_layout.addLayout(content_layout, 1)

        left_column = QVBoxLayout()
        left_column.setSpacing(14)
        content_layout.addLayout(left_column, 1)

        center_column = QVBoxLayout()
        center_column.setSpacing(14)
        content_layout.addLayout(center_column, 2)

        right_column = QVBoxLayout()
        right_column.setSpacing(14)
        content_layout.addLayout(right_column, 1)

        self.build_left_column(left_column)
        self.build_center_column(center_column)
        self.build_right_column(right_column)

    def build_left_column(self, parent):
        connect_panel, connect_layout = self.section("CONNECT & LOG")

        com_layout = QHBoxLayout()
        com_layout.setSpacing(8)

        self.combo_com = QComboBox()
        com_layout.addWidget(self.combo_com, 1)

        self.btn_load_com = self.make_button("LOAD COM")
        self.btn_load_com.clicked.connect(self.load_com_ports)
        com_layout.addWidget(self.btn_load_com)

        connect_layout.addLayout(com_layout)

        baud_layout = QHBoxLayout()
        baud_layout.setSpacing(8)

        self.combo_baud = QComboBox()
        self.combo_baud.addItems(["9600", "57600", "115200", "230400", "460800", "921600"])
        self.combo_baud.setCurrentText("115200")
        baud_layout.addWidget(QLabel("Baudrate"))
        baud_layout.addWidget(self.combo_baud, 1)
        connect_layout.addLayout(baud_layout)

        control_layout = QHBoxLayout()
        control_layout.setSpacing(8)

        self.btn_start = self.make_button("START", "success")
        self.btn_start.clicked.connect(self.start_system)
        control_layout.addWidget(self.btn_start)

        self.btn_stop = self.make_button("STOP", "danger")
        self.btn_stop.clicked.connect(self.stop_system)
        self.btn_stop.setEnabled(False)
        control_layout.addWidget(self.btn_stop)

        connect_layout.addLayout(control_layout)

        self.txt_log = QTextEdit()
        self.txt_log.setReadOnly(True)
        self.txt_log.setFixedHeight(260)
        connect_layout.addWidget(self.txt_log)

        parent.addWidget(connect_panel)

        model_panel, model_layout = self.section("MODEL AI")

        self.lbl_model_path = QLabel(self.model_path)
        self.lbl_model_path.setWordWrap(True)
        self.lbl_model_path.setObjectName("subTitle")
        model_layout.addWidget(QLabel("Model đang dùng"))
        model_layout.addWidget(self.lbl_model_path)

        self.btn_choose_model = self.make_button("CHỌN MODEL", "primary")
        self.btn_choose_model.clicked.connect(self.choose_model)
        model_layout.addWidget(self.btn_choose_model)

        self.txt_camera = QLineEdit("0")
        self.txt_camera.hide()

        parent.addWidget(model_panel)
        parent.addStretch()

    def build_center_column(self, parent):
        camera_panel, camera_layout = self.section("CAMERA VIEW")

        self.lbl_camera = CameraViewLabel("CAMERA TẮT")
        self.lbl_camera.setObjectName("cameraView")
        self.lbl_camera.setAlignment(Qt.AlignCenter)
        self.lbl_camera.setMinimumSize(CAMERA_PREVIEW_MIN_WIDTH, CAMERA_PREVIEW_MIN_HEIGHT)
        self.lbl_camera.setMaximumSize(CAMERA_PREVIEW_WIDTH, CAMERA_PREVIEW_HEIGHT)
        self.lbl_camera.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        camera_layout.addWidget(self.lbl_camera, 0, Qt.AlignHCenter)

        camera_buttons = QHBoxLayout()
        camera_buttons.setSpacing(8)

        self.btn_camera_on = self.make_button("BẬT CAMERA", "success")
        self.btn_camera_on.clicked.connect(self.bat_camera_preview)
        camera_buttons.addWidget(self.btn_camera_on)

        self.btn_camera_off = self.make_button("TẮT CAMERA", "danger")
        self.btn_camera_off.clicked.connect(self.tat_camera_preview)
        camera_buttons.addWidget(self.btn_camera_off)

        camera_layout.addLayout(camera_buttons)


        product_info_title = QLabel("THÔNG TIN SẢN PHẨM HIỆN TẠI")
        product_info_title.setObjectName("metricTitle")
        camera_layout.addWidget(product_info_title)

        product_info_grid = QGridLayout()
        product_info_grid.setHorizontalSpacing(8)
        product_info_grid.setVerticalSpacing(8)
        product_info_grid.setColumnStretch(0, 1)
        product_info_grid.setColumnStretch(1, 1)
        product_info_grid.setColumnStretch(2, 1)

        self.current_price_labels = {}
        self.current_stock_labels = {}

        product_headers = ["Sản phẩm", "Giá hiện tại", "Số lượng"]
        for col_index, header_text in enumerate(product_headers):
            header_label = QLabel(header_text)
            header_label.setAlignment(Qt.AlignCenter)
            header_label.setStyleSheet("""
                background:#eef2f7;
                border:1px solid #d9e2ec;
                border-radius:6px;
                padding:8px;
                font-size:14px;
                font-weight:900;
                color:#344054;
            """)
            product_info_grid.addWidget(header_label, 0, col_index)

        for sp in range(1, 5):
            product_name = QLabel(f"SP{sp}")
            product_name.setAlignment(Qt.AlignCenter)
            product_name.setStyleSheet("""
                background:#ffffff;
                border:1px solid #e4e7ec;
                border-radius:6px;
                padding:8px;
                font-size:15px;
                font-weight:900;
                color:#101828;
            """)

            current_price = QLabel("--")
            current_price.setAlignment(Qt.AlignCenter)
            current_price.setStyleSheet("""
                background:#ffffff;
                border:1px solid #e4e7ec;
                border-radius:6px;
                padding:8px;
                font-size:15px;
                font-weight:800;
                color:#101828;
            """)

            current_stock = QLabel("--")
            current_stock.setAlignment(Qt.AlignCenter)
            current_stock.setStyleSheet("""
                background:#ffffff;
                border:1px solid #e4e7ec;
                border-radius:6px;
                padding:8px;
                font-size:15px;
                font-weight:800;
                color:#101828;
            """)

            self.current_price_labels[sp] = current_price
            self.current_stock_labels[sp] = current_stock

            product_info_grid.addWidget(product_name, sp, 0)
            product_info_grid.addWidget(current_price, sp, 1)
            product_info_grid.addWidget(current_stock, sp, 2)

        camera_layout.addLayout(product_info_grid)

        self.btn_open_web = self.make_button("MỞ WEB QUẢN LÝ", "primary")
        self.btn_open_web.clicked.connect(self.open_management_web)
        camera_layout.addWidget(self.btn_open_web)

        parent.addWidget(camera_panel, 0)
        parent.addStretch()

    def build_right_column(self, parent):
        score_panel, score_layout = self.section("NHẬN DIỆN")

        self.lbl_last_result = QLabel("Chưa có kết quả")
        self.lbl_last_result.setObjectName("metricValue")
        self.lbl_last_result.setAlignment(Qt.AlignCenter)
        self.lbl_last_result.setStyleSheet("""
            background-color:#f8fafc;
            border:1px solid #d0d5dd;
            border-radius:8px;
            padding:12px;
            font-size:22px;
            font-weight:900;
        """)
        score_layout.addWidget(self.lbl_last_result)

        grid = QGridLayout()
        grid.setHorizontalSpacing(8)
        grid.setVerticalSpacing(8)
        self.score_labels = {}

        for i, name in enumerate(MONEY_CLASSES):
            display_name = f"{format_money(CLASS_TO_VALUE[name])} VND"
            box, label = self.make_metric(display_name, "0% / 0.00")
            self.score_labels[name] = label
            grid.addWidget(box, i // 2, i % 2)

        score_layout.addLayout(grid)
        parent.addWidget(score_panel)

        product_panel, product_layout = self.section("CÀI ĐẶT SẢN PHẨM")

        header = QGridLayout()
        header.setHorizontalSpacing(8)
        header.setColumnMinimumWidth(0, 38)
        header.setColumnStretch(0, 0)
        header.setColumnStretch(1, 2)
        header.setColumnStretch(2, 1)
        header.setColumnStretch(3, 1)

        sp_header = QLabel("SP")
        sp_header.setFixedWidth(38)
        sp_header.setAlignment(Qt.AlignCenter)
        header.addWidget(sp_header, 0, 0)
        header.addWidget(QLabel("Giá tiền"), 0, 1)
        header.addWidget(QLabel("Số lượng"), 0, 2)
        header.addWidget(QLabel("Lệnh"), 0, 3)
        product_layout.addLayout(header)

        self.price_edits = {}
        self.stock_edits = {}

        default_prices = [10000, 10000, 10000, 10000]
        default_stocks = [3, 3, 3, 3]

        grid = QGridLayout()
        grid.setHorizontalSpacing(8)
        grid.setVerticalSpacing(8)
        grid.setColumnMinimumWidth(0, 38)
        grid.setColumnStretch(0, 0)
        grid.setColumnStretch(1, 2)
        grid.setColumnStretch(2, 1)
        grid.setColumnStretch(3, 1)

        for sp in range(1, 5):
            lbl = QLabel(f"SP{sp}")
            lbl.setObjectName("metricTitle")
            lbl.setFixedWidth(38)
            lbl.setAlignment(Qt.AlignCenter)

            price_edit = QLineEdit(str(default_prices[sp - 1]))
            price_edit.setPlaceholderText("5000 -> 500000")

            stock_edit = QLineEdit(str(default_stocks[sp - 1]))
            stock_edit.setPlaceholderText("0 -> 3")

            send_btn = self.make_button("GỬI")
            send_btn.clicked.connect(lambda checked=False, product=sp: self.send_one_product_config(product))

            self.price_edits[sp] = price_edit
            self.stock_edits[sp] = stock_edit

            grid.addWidget(lbl, sp - 1, 0)
            grid.addWidget(price_edit, sp - 1, 1)
            grid.addWidget(stock_edit, sp - 1, 2)
            grid.addWidget(send_btn, sp - 1, 3)

        product_layout.addLayout(grid)

        product_buttons = QHBoxLayout()
        self.btn_send_all_products = self.make_button("GỬI TẤT CẢ", "primary")
        self.btn_send_all_products.clicked.connect(self.send_all_product_config)
        product_buttons.addWidget(self.btn_send_all_products)

        self.btn_reset_product_fields = self.make_button("MẶC ĐỊNH")
        self.btn_reset_product_fields.clicked.connect(self.reset_product_fields)
        product_buttons.addWidget(self.btn_reset_product_fields)
        product_layout.addLayout(product_buttons)

        parent.addWidget(product_panel)
        parent.addStretch()

    def get_log_group(self, msg):
        if msg.startswith(("SYSTEM", "?ang t?i YOLO", "Class model", "M? COM", "M? camera", "Camera:", "ROI:")):
            return "system"
        if msg.startswith(("?? b?t hi?n th? camera", "?? t?t hi?n th? camera", "T? ??ng b?t camera")):
            return "camera"
        if msg.startswith(("RX: #START", "RX: #END", "Nh?n #START", "Nh?n #END", "?? th?y ti?n", "TX: #HOPLE", "K?T QU?", "?? x?c nh?n", "H?t th?i gian")):
            return "bill"
        if msg.startswith(("TX: #SET", "?? g?i", "H?y b?m", "?? ??a gi?")):
            return "config"
        if msg.startswith(("M? web", "Mo web")):
            return "web"
        if msg.startswith(("ERROR", "Read COM error", "Kh?ng", "L?i")):
            return "error"
        if "COM" in msg:
            return "com"
        return "other"

    def log(self, msg):
        group = self.get_log_group(msg)
        if self.last_log_group is not None and group != self.last_log_group:
            self.txt_log.append("")
        self.txt_log.append(msg)
        self.last_log_group = group

    def load_com_ports(self):
        self.combo_com.clear()
        ports = serial.tools.list_ports.comports()

        for port in ports:
            self.combo_com.addItem(f"{port.device} - {port.description}", port.device)

        if self.last_port_count != len(ports):
            self.log(f"Đã tải {len(ports)} COM")
        self.last_port_count = len(ports)

    def choose_model(self):
        model_path, _ = QFileDialog.getOpenFileName(
            self,
            "Chọn model YOLO",
            DEFAULT_MODEL_DIR,
            "YOLO model (*.pt *.onnx *.engine);;Tất cả tệp (*.*)",
        )

        if not model_path:
            return

        self.model_path = model_path
        self.lbl_model_path.setText(model_path)
        self.log(f"Đã chọn model: {model_path}")

    def get_config(self):
        if self.combo_com.currentIndex() < 0:
            raise ValueError("Chưa chọn COM")

        if not os.path.isfile(self.model_path):
            raise ValueError(f"Không tìm thấy model: {self.model_path}")

        return {
            "port": self.combo_com.currentData(),
            "baud": int(self.combo_baud.currentText()),
            "camera": int(self.txt_camera.text()),
            "model_path": self.model_path,
            "min_conf": 0.55,
            "score_threshold": 1.3,
            "gap_threshold": 0.35,
            "max_time": 3.0,
            "settle": 0.3,
            "preview": self.camera_preview_enabled,
        }

    def reset_product_fields(self):
        for sp in range(1, 5):
            self.price_edits[sp].setText("10000")
            self.stock_edits[sp].setText("3")
        self.log("Đã đưa giá và số lượng về mặc định trên giao diện")

    def read_product_config(self, sp):
        try:
            price = int(self.price_edits[sp].text().strip())
            stock = int(self.stock_edits[sp].text().strip())
        except Exception:
            raise ValueError(f"SP{sp}: giá/số lượng phải là số nguyên")

        if price < 5000 or price > 500000:
            raise ValueError(f"SP{sp}: giá phải từ 5000 đến 500000")

        if price % 5000 != 0:
            raise ValueError(f"SP{sp}: giá phải là bội số của 5000")

        if stock < 0 or stock > 3:
            raise ValueError(f"SP{sp}: số lượng phải từ 0 đến 3")

        return price, stock

    def request_product_config(self):
        self.send_serial_command("GETCFG")

    def update_product_config_from_machine(self, sp, price, stock):
        if sp not in self.current_price_labels:
            return

        self.current_price_labels[sp].setText(f"{format_money(price)} VND")
        self.current_stock_labels[sp].setText(str(stock))

        if sp in self.price_edits:
            self.price_edits[sp].setText(str(price))
        if sp in self.stock_edits:
            self.stock_edits[sp].setText(str(stock))
    def send_serial_command(self, command):
        if self.worker is None or not self.worker.isRunning():
            self.log("Hãy bấm START trước khi gửi cấu hình")
            return

        self.worker.send_command(command)

    def send_one_product_config(self, sp):
        try:
            price, stock = self.read_product_config(sp)
        except Exception as e:
            QMessageBox.warning(self, "Lỗi cấu hình sản phẩm", str(e))
            return

        self.send_serial_command(f"SETGIA:{sp},{price}")
        self.send_serial_command(f"SETSL:{sp},{stock}")
        self.log(f"Gửi cấu hình SP{sp}: giá={price}, số lượng={stock}")
        self.request_product_config()

    def send_all_product_config(self):
        try:
            configs = {}
            for sp in range(1, 5):
                configs[sp] = self.read_product_config(sp)
        except Exception as e:
            QMessageBox.warning(self, "Lỗi cấu hình sản phẩm", str(e))
            return

        for sp, (price, stock) in configs.items():
            self.send_serial_command(f"SETGIA:{sp},{price}")
            self.send_serial_command(f"SETSL:{sp},{stock}")

        self.log("Đã gửi cấu hình tất cả sản phẩm")
        self.request_product_config()

    def open_management_web(self):
        QDesktopServices.openUrl(QUrl(MANAGEMENT_WEB_URL))
        self.log(f"Mở web quản lý: {MANAGEMENT_WEB_URL}")

    def start_system(self):
        try:
            config = self.get_config()
        except Exception as e:
            QMessageBox.warning(self, "Lỗi cấu hình", str(e))
            return

        self.camera_preview_enabled = True
        self.stop_camera_preview(wait=True)

        self.worker = DetectWorker(config)
        self.worker.logSignal.connect(self.log)
        self.worker.frameSignal.connect(self.update_camera_view)
        self.worker.statusSignal.connect(self.update_status)
        self.worker.scoreSignal.connect(self.update_scores)
        self.worker.resultSignal.connect(self.update_result)
        self.worker.invalidSignal.connect(self.update_invalid_result)
        self.worker.resetResultSignal.connect(self.reset_result_panel)
        self.worker.productConfigSignal.connect(self.update_product_config_from_machine)
        self.worker.stoppedSignal.connect(self.worker_stopped)
        self.worker.start()

        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.btn_load_com.setEnabled(False)
        self.log("SYSTEM START")
        self.log("Tự động bật camera khi kết nối ESP32")

    def stop_system(self):
        if self.worker:
            self.worker.stop()
            self.log("Đang dừng hệ thống...")

        self.btn_stop.setEnabled(False)

    def worker_stopped(self):
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.btn_load_com.setEnabled(True)
        self.update_status("OFFLINE")
        self.worker = None
        if self.camera_preview_enabled:
            self.start_camera_preview()
        else:
            self.lbl_camera.clear()
            self.lbl_camera.setText("CAMERA TẮT")
        self.log("SYSTEM STOP")

    def update_status(self, status):
        self.lbl_status.setText(status)

        if status == "WAIT #START":
            color = "#dcfce7"
            text = "#166534"
            border = "#bbf7d0"
        elif status == "DETECTING":
            color = "#fef3c7"
            text = "#92400e"
            border = "#fde68a"
        elif status == "ERROR":
            color = "#fee2e2"
            text = "#991b1b"
            border = "#fecaca"
        else:
            color = "#e0f2fe"
            text = "#075985"
            border = "#bae6fd"

        self.lbl_status.setStyleSheet(f"""
            background-color:{color};
            color:{text};
            border:1px solid {border};
            border-radius:8px;
            font-size:24px;
            font-weight:900;
        """)

    def bat_camera_preview(self):
        self.camera_preview_enabled = True
        if self.worker is None or not self.worker.isRunning():
            self.start_camera_preview()
        self.log("Đã bật hiển thị camera")

    def tat_camera_preview(self):
        self.camera_preview_enabled = False
        self.stop_camera_preview(wait=False)
        self.lbl_camera.clear()
        self.lbl_camera.setText("CAMERA TẮT")
        self.log("Đã tắt hiển thị camera")

    def start_camera_preview(self):
        if self.preview_worker is not None and self.preview_worker.isRunning():
            return

        camera_index = int(self.txt_camera.text() or "0")
        self.preview_worker = CameraPreviewWorker(camera_index)
        self.preview_worker.frameSignal.connect(self.update_camera_view)
        self.preview_worker.logSignal.connect(self.log)
        self.preview_worker.stoppedSignal.connect(self.preview_worker_stopped)
        self.preview_worker.start()

    def stop_camera_preview(self, wait=False):
        if self.preview_worker is None:
            return

        self.preview_worker.stop()
        if wait:
            self.preview_worker.wait(1500)

    def preview_worker_stopped(self):
        self.preview_worker = None

    def update_camera_view(self, image):
        if not self.camera_preview_enabled:
            return

        pixmap = QPixmap.fromImage(image)
        pixmap = pixmap.scaled(
            self.lbl_camera.size(),
            Qt.KeepAspectRatioByExpanding,
            Qt.SmoothTransformation
        )
        if pixmap.width() > self.lbl_camera.width() or pixmap.height() > self.lbl_camera.height():
            x = max(0, (pixmap.width() - self.lbl_camera.width()) // 2)
            y = max(0, (pixmap.height() - self.lbl_camera.height()) // 2)
            pixmap = pixmap.copy(x, y, self.lbl_camera.width(), self.lbl_camera.height())
        self.lbl_camera.setPixmap(pixmap)

    def update_scores(self, confidence_percent, scores, best_name, best_score, gap):
        for name in MONEY_CLASSES:
            percent = confidence_percent.get(name, 0.0)
            raw_score = scores.get(name, 0.0)
            self.score_labels[name].setText(f"{percent:.0f}% / {raw_score:.2f}")

    def set_result_panel_normal_style(self):
        self.lbl_last_result.setStyleSheet("""
            background-color:#f8fafc;
            border:1px solid #d0d5dd;
            border-radius:8px;
            padding:12px;
            font-size:22px;
            font-weight:900;
        """)

    def set_result_panel_invalid_style(self):
        self.lbl_last_result.setStyleSheet("""
            background-color:#fef2f2;
            border:2px solid #ef4444;
            border-radius:8px;
            padding:12px;
            font-size:22px;
            font-weight:900;
            color:#991b1b;
        """)

    def reset_result_panel(self):
        self.lbl_last_result.setText("Chưa có kết quả")
        self.set_result_panel_normal_style()
        for label in self.score_labels.values():
            label.setText("0% / 0.00")

    def update_invalid_result(self, message):
        self.lbl_last_result.setText(message)
        self.set_result_panel_invalid_style()

    def update_result(self, name, value, score, confidence_percent):
        self.lbl_last_result.setText(f"{format_money(value)} VND")
        self.set_result_panel_normal_style()

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_F11:
            if self.isFullScreen():
                self.showMaximized()
            else:
                self.showFullScreen()
            return

        if event.key() == Qt.Key_Escape:
            self.close()
            return

        super().keyPressEvent(event)

    def closeEvent(self, event):
        if self.worker:
            self.worker.stop()
            self.worker.wait(2000)

        self.stop_camera_preview(wait=True)

        event.accept()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = VendingMoneyApp()
    window.showMaximized()
    sys.exit(app.exec_())

