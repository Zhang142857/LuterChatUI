import os
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from openai import OpenAI
import secrets
import json
from datetime import datetime
import time
from sqlalchemy import inspect, text

# 尝试导入智谱清言API库
try:
    import zhipuai
except ImportError:
    print("Warning: zhipuai库未安装，智谱清言API将不可用。请使用 pip install --upgrade zhipuai 安装")
    zhipuai = None

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(16)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///ai_chat.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 添加hasattr函数到Jinja2环境
app.jinja_env.globals['hasattr'] = hasattr

# 创建用于存储Markdown文件的目录
MARKDOWN_DIR = os.path.join('static', 'markdown')
os.makedirs(MARKDOWN_DIR, exist_ok=True)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# 支持的模型列表
SUPPORTED_MODELS = [
    "Qwen/QwQ-32B", 
    "Pro/deepseek-ai/DeepSeek-R1", 
    "Pro/deepseek-ai/DeepSeek-V3", 
    "deepseek-ai/DeepSeek-R1", 
    "deepseek-ai/DeepSeek-V3", 
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", 
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", 
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", 
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", 
    "Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", 
    "Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", 
    "deepseek-ai/DeepSeek-V2.5", 
    "Qwen/Qwen2.5-72B-Instruct-128K", 
    "Qwen/Qwen2.5-72B-Instruct", 
    "Qwen/Qwen2.5-32B-Instruct", 
    "Qwen/Qwen2.5-14B-Instruct", 
    "Qwen/Qwen2.5-7B-Instruct", 
    "Qwen/Qwen2.5-Coder-32B-Instruct", 
    "Qwen/Qwen2.5-Coder-7B-Instruct", 
    "Qwen/Qwen2-7B-Instruct", 
    "Qwen/Qwen2-1.5B-Instruct", 
    "Qwen/QwQ-32B-Preview", 
    "TeleAI/TeleChat2", 
    "THUDM/glm-4-9b-chat", 
    "Vendor-A/Qwen/Qwen2.5-72B-Instruct", 
    "internlm/internlm2_5-7b-chat", 
    "internlm/internlm2_5-20b-chat", 
    "Pro/Qwen/Qwen2.5-7B-Instruct", 
    "Pro/Qwen/Qwen2-7B-Instruct", 
    "Pro/Qwen/Qwen2-1.5B-Instruct", 
    "Pro/THUDM/chatglm3-6b", 
    "Pro/THUDM/glm-4-9b-chat",
    "zhipuai/glm-4-plus",
    "zhipuai/glm-4-0520",
    "zhipuai/glm-4",
    "zhipuai/glm-4-air",
    "zhipuai/glm-4-airx",
    "zhipuai/glm-4-long",
    "zhipuai/glm-4-flash",
    "zhipuai/glm-3-turbo",
    "zhipuai/glm-zero-preview"
]

# 数据库模型
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    api_key = db.Column(db.String(200))
    api_base_url = db.Column(db.String(200), default="https://api.siliconflow.cn/v1")
    zhipuai_api_key = db.Column(db.String(200))
    zhipuai_api_base_url = db.Column(db.String(200), default="https://open.bigmodel.cn/api/paas/v4")
    default_model = db.Column(db.String(100), default="deepseek-ai/DeepSeek-V3")
    theme = db.Column(db.String(20), default="colorful")  # 新增主题设置字段：colorful(彩色), light(明亮), dark(黑暗)
    conversations = db.relationship('Conversation', backref='user', lazy=True)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), default="新对话")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    messages = db.relationship('Message', backref='conversation', lazy=True)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(20), nullable=False)  # system, user, assistant
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# 路由
@app.route('/')
def home():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            flash('用户名已存在，请选择其他用户名')
            return redirect(url_for('register'))
        
        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        
        flash('注册成功，请登录')
        return redirect(url_for('login'))
    
    return render_template('register.html', user=None)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('chat'))
        
        flash('用户名或密码错误')
    
    return render_template('login.html', user=None)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/chat')
@login_required
def chat():
    conversations = Conversation.query.filter_by(user_id=current_user.id).order_by(Conversation.created_at.desc()).all()
    current_conversation_id = request.args.get('conversation_id')
    
    if current_conversation_id:
        current_conversation = db.session.get(Conversation, current_conversation_id)
        if current_conversation and current_conversation.user_id == current_user.id:
            messages = Message.query.filter_by(conversation_id=current_conversation_id).order_by(Message.created_at).all()
            return render_template('chat.html', conversations=conversations, current_conversation=current_conversation, messages=messages, models=SUPPORTED_MODELS)
    
    # 如果没有指定对话或者对话不存在，创建新对话
    new_conversation = Conversation(user_id=current_user.id)
    db.session.add(new_conversation)
    db.session.commit()
    
    return render_template('chat.html', conversations=conversations, current_conversation=new_conversation, messages=[], models=SUPPORTED_MODELS)

@app.route('/api/conversations', methods=['POST'])
@login_required
def create_conversation():
    new_conversation = Conversation(user_id=current_user.id)
    db.session.add(new_conversation)
    db.session.commit()
    
    return jsonify({
        'id': new_conversation.id,
        'title': new_conversation.title,
        'created_at': new_conversation.created_at.isoformat()
    })

@app.route('/api/conversations/<int:conversation_id>', methods=['DELETE'])
@login_required
def delete_conversation(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    
    if conversation.user_id != current_user.id:
        return jsonify({'error': '未授权'}), 403
    
    Message.query.filter_by(conversation_id=conversation_id).delete()
    db.session.delete(conversation)
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/conversations/<int:conversation_id>/title', methods=['PUT'])
@login_required
def update_conversation_title(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    
    if conversation.user_id != current_user.id:
        return jsonify({'error': '未授权'}), 403
    
    data = request.get_json()
    conversation.title = data.get('title', '新对话')
    db.session.commit()
    
    return jsonify({
        'id': conversation.id,
        'title': conversation.title
    })

@app.route('/api/chat', methods=['POST'])
@login_required
def send_message():
    try:
        data = request.get_json()
        user_message = data.get('message')
        conversation_id = data.get('conversation_id')
        model = data.get('model', current_user.default_model)  # 从请求中获取模型，如果没有则使用默认模型
        
        # 获取高级参数
        use_stream = data.get('stream', True)
        max_tokens = data.get('max_tokens', 1024)
        stop_sequences = data.get('stop')
        temperature = data.get('temperature', 0.7)
        top_p = data.get('top_p', 0.7)
        top_k = data.get('top_k', 50)
        frequency_penalty = data.get('frequency_penalty', 0.5)
        n_completions = data.get('n', 1)
        response_format = data.get('response_format', {"type": "text"})
        
        conversation = Conversation.query.get_or_404(conversation_id)
        if conversation.user_id != current_user.id:
            return jsonify({'error': '未授权'}), 403
        
        # 创建Markdown文件
        timestamp = int(time.time())
        markdown_file = f"{conversation_id}_{timestamp}.md"
        markdown_path = os.path.join(MARKDOWN_DIR, markdown_file)
        
        # 保存用户问题到Markdown
        with open(markdown_path, 'w', encoding='utf-8') as f:
            f.write(f"## 用户\n\n{user_message}\n\n## AI助手\n\n")
        
        # 保存用户消息
        user_msg = Message(role='user', content=user_message, conversation_id=conversation_id)
        db.session.add(user_msg)
        db.session.commit()
        
        # 获取对话历史
        messages = Message.query.filter_by(conversation_id=conversation_id).order_by(Message.created_at).all()
        
        # 根据不同的模型设置适当的system prompt
        system_prompt = "You are a helpful assistant. "
        
        # 为glm-zero-preview模型设置特殊的system prompt
        if model == "zhipuai/glm-zero-preview":
            system_prompt = "Please think deeply before your response."
            
        message_list = [{"role": "system", "content": system_prompt}]
        
        for msg in messages:
            message_list.append({"role": msg.role, "content": msg.content})
        
        # 确定模型提供商
        is_zhipuai_model = model.startswith('zhipuai/')
        
        # 检查用户API设置
        if is_zhipuai_model:
            if not current_user.zhipuai_api_key:
                error_msg = "请先在设置中配置智谱清言API密钥"
                print(f"错误: {error_msg}")
                return jsonify({'error': error_msg}), 400
        else:
            if not current_user.api_key:
                error_msg = "请先在设置中配置硅基流动API密钥"
                print(f"错误: {error_msg}")
                return jsonify({'error': error_msg}), 400
        
        # 创建API客户端
        try:
            if is_zhipuai_model:
                # 创建智谱清言API客户端
                client = zhipuai.ZhipuAI(
                    api_key=current_user.zhipuai_api_key,
                    base_url=current_user.zhipuai_api_base_url
                )
                # 移除zhipuai/前缀
                model_name = model.replace('zhipuai/', '')
            else:
                # 创建OpenAI格式的API客户端
                client = OpenAI(
                    api_key=current_user.api_key,
                    base_url=current_user.api_base_url
                )
        except Exception as e:
            error_msg = f"创建API客户端失败: {str(e)}"
            print(f"错误: {error_msg}")
            return jsonify({'error': error_msg}), 500
        
        # 准备API参数
        api_params = {
            "model": model_name if is_zhipuai_model else model,
            "messages": message_list,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "stream": use_stream
        }
        
        # 只添加非默认值的参数
        if stop_sequences:
            api_params["stop"] = stop_sequences
        
        if top_k != 50:  # 只有当值不是默认的50时才添加
            api_params["top_k"] = top_k
            
        if n_completions != 1:
            api_params["n"] = n_completions
            
        if response_format != {"type": "text"}:
            api_params["response_format"] = response_format
            
        # 如果不是智谱清言API，添加frequency_penalty参数
        if not is_zhipuai_model:
            api_params["frequency_penalty"] = frequency_penalty
        
        # 创建一个空的助手消息记录
        assistant_msg = Message(role='assistant', content='', conversation_id=conversation_id)
        db.session.add(assistant_msg)
        db.session.commit()
        
        # 重要：获取ID，避免在生成器中访问数据库对象
        assistant_msg_id = assistant_msg.id
        
        # 调用API - 使用指定的模型和参数
        try:
            # 创建聊天完成请求
            response = client.chat.completions.create(**api_params)
            # 根据is_zhipuai_model标志选择不同的处理方式
            # 因为两个API的返回格式是兼容的，所以可以统一处理
        except Exception as e:
            error_msg = f"API调用失败: {str(e)}"
            print(f"错误: {error_msg}")
            
            # 更新错误信息到数据库
            with app.app_context():
                db_msg = db.session.get(Message, assistant_msg_id)
                if db_msg:
                    db_msg.content = f"Error: {error_msg}"
                    db.session.commit()
            
            # 写入错误信息到Markdown文件
            with open(markdown_path, 'a', encoding='utf-8') as f:
                f.write(f"API调用失败: {str(e)}")
            
            return jsonify({
                'error': error_msg,
                'message_id': assistant_msg_id,
                'markdown_file': markdown_file,
            }), 500
        
        # 如果不使用流式传输，则直接返回完整响应
        if not use_stream:
            try:
                content = response.choices[0].message.content
                
                # 将回答写入Markdown文件
                with open(markdown_path, 'a', encoding='utf-8') as f:
                    f.write(content)
                
                # 更新数据库中的消息
                with app.app_context():
                    db_msg = db.session.get(Message, assistant_msg_id)
                    if db_msg:
                        db_msg.content = content
                        db.session.commit()
                    
                    # 更新对话标题
                    if conversation.title == "新对话" and len(messages) <= 1:
                        title = user_message[:30] + ("..." if len(user_message) > 30 else "")
                        conversation.title = title
                        db.session.commit()
                
                # 返回完整响应
                return jsonify({
                    'content': content,
                    'message_id': assistant_msg_id,
                    'markdown_file': markdown_file,
                    'title_update': {
                        'id': conversation.id,
                        'title': conversation.title
                    } if conversation.title != "新对话" else None
                })
            except Exception as e:
                error_msg = f"处理API响应失败: {str(e)}"
                print(f"错误: {error_msg}")
                return jsonify({'error': error_msg}), 500
        
        # 流式响应处理（两个API的流式响应格式兼容）
        def generate():
            try:
                full_response = ""
                reasoning_response = ""
                # 储存需要使用的ID和消息，避免在生成器中访问外部作用域的数据库对象
                conversation_id_local = conversation_id
                user_message_local = user_message
                message_count = len(messages)
                
                # 新建一个应用上下文，避免会话过期问题
                with app.app_context():
                    for chunk in response:
                        if not chunk.choices:
                            continue
                        if chunk.choices[0].delta.content:
                            content = chunk.choices[0].delta.content
                            full_response += content
                            
                            # 将内容写入Markdown文件
                            with open(markdown_path, 'a', encoding='utf-8') as f:
                                f.write(content)
                            
                            # 读取当前完整的Markdown内容
                            try:
                                with open(markdown_path, 'r', encoding='utf-8') as f:
                                    current_markdown = f.read()
                            except:
                                current_markdown = ""
                            
                            # 在命令行打印AI回答（内容）
                            print(content, end="", flush=True)
                            yield f"data: {json.dumps({'content': content, 'message_id': assistant_msg_id, 'markdown_file': markdown_file, 'markdown_content': current_markdown})}\n\n"
                        if hasattr(chunk.choices[0].delta, 'reasoning_content') and chunk.choices[0].delta.reasoning_content:
                            content = chunk.choices[0].delta.reasoning_content
                            reasoning_response += content
                            # 在命令行打印AI回答（推理内容）
                            print(f"\033[36m[思考]\033[0m {content}", end="", flush=True)
                            yield f"data: {json.dumps({'reasoning_content': content, 'message_id': assistant_msg_id})}\n\n"
                    
                    # 打印完整响应结束标记
                    print("\n--- AI回答结束 ---")
                    print(f"使用模型: {model}")  # 打印使用的模型
                    
                    # 更新完整响应到数据库（包括思考和回答内容）
                    db_msg = db.session.get(Message, assistant_msg_id)
                    if db_msg:
                        # 如果有推理内容，保存格式化后的完整内容
                        if reasoning_response:
                            formatted_content = f"<answer>{full_response}</answer><reasoning>{reasoning_response}</reasoning>"
                            db_msg.content = formatted_content
                        else:
                            db_msg.content = full_response
                        db.session.commit()
                    
                    # 如果是新对话并且标题是默认值，使用第一条消息作为标题
                    # 在应用上下文中重新查询对话
                    current_conversation = db.session.get(Conversation, conversation_id_local)
                    if current_conversation and current_conversation.title == "新对话" and message_count <= 1:
                        title = user_message_local[:30] + ("..." if len(user_message_local) > 30 else "")
                        current_conversation.title = title
                        db.session.commit()
                        yield f"data: {json.dumps({'title_update': {'id': current_conversation.id, 'title': title}})}\n\n"
                    
                    yield "data: [DONE]\n\n"
            except Exception as e:
                error_msg = f"流式传输错误: {str(e)}"
                print(f"错误: {error_msg}")
                
                # 更新错误信息到数据库
                with app.app_context():
                    db_msg = db.session.get(Message, assistant_msg_id)
                    if db_msg:
                        db_msg.content = f"Error: {error_msg}"
                        db.session.commit()
                
                yield f"data: {json.dumps({'error': error_msg, 'message_id': assistant_msg_id})}\n\n"
                yield "data: [DONE]\n\n"
        
        return app.response_class(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        # 如果出错，记录错误信息并返回
        error_msg = f"请求处理错误: {str(e)}"
        print(f"错误: {error_msg}")
        
        try:
            # 如果可能，保存错误信息到数据库
            if 'conversation_id' in locals() and conversation_id:
                error_msg_obj = Message(role='assistant', content=f"Error: {error_msg}", conversation_id=conversation_id)
                db.session.add(error_msg_obj)
                db.session.commit()
        except:
            pass
        
        return jsonify({'error': error_msg}), 500

@app.route('/settings')
@login_required
def settings():
    return render_template('settings.html', user=current_user, models=SUPPORTED_MODELS)

@app.route('/api/settings', methods=['PUT'])
@login_required
def update_settings():
    data = request.get_json()
    
    current_user.api_key = data.get('api_key', current_user.api_key)
    current_user.api_base_url = data.get('api_base_url', current_user.api_base_url)
    current_user.zhipuai_api_key = data.get('zhipuai_api_key', current_user.zhipuai_api_key)
    current_user.zhipuai_api_base_url = data.get('zhipuai_api_base_url', current_user.zhipuai_api_base_url)
    current_user.default_model = data.get('default_model', current_user.default_model)
    current_user.theme = data.get('theme', current_user.theme)  # 处理主题设置
    
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/markdown/<filename>')
@login_required
def get_markdown(filename):
    """获取指定的Markdown文件"""
    # 安全检查：确保文件名合法
    if '..' in filename or '/' in filename:
        return "无效的文件名", 400
    
    file_path = os.path.join(MARKDOWN_DIR, filename)
    
    # 检查文件是否存在
    if not os.path.exists(file_path):
        return "文件不存在", 404
    
    # 读取Markdown内容
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 处理内容中可能出现的`字符，避免在JavaScript字符串中出现问题
        escaped_content = content.replace('`', '\\`')
        
        # 构建HTML页面，包含样式和Markdown内容
        html_content = """
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Markdown查看器</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.1.0/github-markdown.min.css">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/styles/github.min.css">
            <style>
                html, body {
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                }
                
                .markdown-container {
                    max-width: 768px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                
                .markdown-body {
                    box-sizing: border-box;
                    min-width: 200px;
                    max-width: 100%;
                    margin: 0 auto;
                    padding: 2rem;
                }
                
                @media (max-width: 767px) {
                    .markdown-body {
                        padding: 1rem;
                    }
                }
                
                /* 代码块样式 */
                pre {
                    background-color: #f6f8fa;
                    border-radius: 6px;
                    padding: 16px;
                    overflow: auto;
                    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
                    font-size: 85%;
                    line-height: 1.45;
                    margin-bottom: 16px;
                }
                
                code {
                    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
                    font-size: 85%;
                    padding: 0.2em 0.4em;
                    margin: 0;
                    border-radius: 6px;
                }
                
                code:not(pre code) {
                    background-color: rgba(175, 184, 193, 0.2);
                }
                
                /* 标题样式 */
                h1, h2, h3, h4, h5, h6 {
                    margin-top: 24px;
                    margin-bottom: 16px;
                    font-weight: 600;
                    line-height: 1.25;
                }
                
                h1 {
                    font-size: 2em;
                    border-bottom: 1px solid #d0d7de;
                    padding-bottom: 0.3em;
                }
                
                h2 {
                    font-size: 1.5em;
                    border-bottom: 1px solid #d0d7de;
                    padding-bottom: 0.3em;
                }
                
                h3 { font-size: 1.25em; }
                h4 { font-size: 1em; }
                
                /* 段落样式 */
                p {
                    margin-top: 0;
                    margin-bottom: 16px;
                    line-height: 1.6;
                }
                
                /* 列表样式 */
                ul, ol {
                    padding-left: 2em;
                    margin-top: 0;
                    margin-bottom: 16px;
                }
                
                li + li {
                    margin-top: 0.25em;
                }
                
                /* 引用块样式 */
                blockquote {
                    padding: 0 1em;
                    color: #57606a;
                    border-left: 0.25em solid #d0d7de;
                    margin: 0 0 16px 0;
                }
                
                blockquote > :first-child {
                    margin-top: 0;
                }
                
                blockquote > :last-child {
                    margin-bottom: 0;
                }
                
                /* 表格样式 */
                table {
                    display: block;
                    width: 100%;
                    width: max-content;
                    max-width: 100%;
                    overflow: auto;
                    margin-top: 0;
                    margin-bottom: 16px;
                    border-spacing: 0;
                    border-collapse: collapse;
                }
                
                table th, table td {
                    padding: 6px 13px;
                    border: 1px solid #d0d7de;
                }
                
                table th {
                    font-weight: 600;
                    background-color: #f6f8fa;
                }
                
                table tr:nth-child(2n) {
                    background-color: #f6f8fa;
                }
                
                /* 增加区分用户和AI回复的颜色 */
                .user-section {
                    background-color: #f3f4f6;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                
                .ai-section {
                    background-color: #f0f9ff;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                
                .section-header {
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: #4b5563;
                }
                
                .ai-section .section-header {
                    color: #0369a1;
                }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/marked@4.2.12/marked.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/core.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/javascript.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/python.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/bash.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/json.min.js"></script>
        </head>
        <body>
            <div class="markdown-container">
                <div class="markdown-body" id="markdown-content">
                    <!-- Markdown内容将通过JavaScript渲染 -->
                </div>
            </div>
            
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // 原始Markdown内容
                    const markdownContent = `""" + escaped_content + """`;
                    
                    // 配置Marked选项
                    marked.setOptions({
                        highlight: function(code, lang) {
                            if (lang && hljs.getLanguage(lang)) {
                                try {
                                    return hljs.highlight(code, { language: lang }).value;
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                            return hljs.highlightAuto(code).value;
                        },
                        breaks: true,
                        gfm: true,
                        headerIds: true,
                        langPrefix: 'language-'
                    });
                    
                    // 分离用户和AI部分
                    const sections = markdownContent.split(/(## 用户|## AI助手)/g);
                    let formattedContent = '';
                    let currentSection = '';
                    
                    for (let i = 0; i < sections.length; i++) {
                        const section = sections[i];
                        
                        if (section === '## 用户') {
                            currentSection = 'user';
                            formattedContent += '<div class="user-section"><div class="section-header">用户:</div>';
                        } else if (section === '## AI助手') {
                            currentSection = 'ai';
                            formattedContent += '<div class="ai-section"><div class="section-header">AI助手:</div>';
                        } else if (currentSection && section.trim()) {
                            // 渲染Markdown
                            formattedContent += marked.parse(section);
                            formattedContent += '</div>';
                        }
                    }
                    
                    // 如果没有分节，则直接渲染整个内容
                    if (!formattedContent) {
                        formattedContent = marked.parse(markdownContent);
                    }
                    
                    // 更新DOM
                    document.getElementById('markdown-content').innerHTML = formattedContent;
                    
                    // 为所有代码块应用语法高亮
                    document.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                });
            </script>
        </body>
        </html>
        """
        
        return html_content
    except Exception as e:
        return f"读取文件出错: {str(e)}", 500

# 新增API端点：获取Markdown内容
@app.route('/api/get_markdown', methods=['GET'])
@login_required
def get_markdown_content():
    file = request.args.get('file')
    if not file:
        return jsonify({'error': '没有指定文件名'}), 400
    
    # 安全检查：确保文件名合法
    if '..' in file or '/' in file:
        return jsonify({'error': '无效的文件名'}), 400
    
    file_path = os.path.join(MARKDOWN_DIR, file)
    
    # 检查文件是否存在
    if not os.path.exists(file_path):
        return jsonify({'error': '文件不存在'}), 404
    
    # 读取文件内容
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return content
    except Exception as e:
        return jsonify({'error': f'读取文件出错: {str(e)}'}), 500

# 新增API端点：下载Markdown文件
@app.route('/api/download_markdown', methods=['GET'])
@login_required
def download_markdown():
    file = request.args.get('file')
    if not file:
        return jsonify({'error': '没有指定文件名'}), 400
    
    # 安全检查：确保文件名合法
    if '..' in file or '/' in file:
        return jsonify({'error': '无效的文件名'}), 400
    
    return send_from_directory(
        MARKDOWN_DIR, 
        file, 
        as_attachment=True, 
        download_name=f"对话记录_{file}"
    )

# 新增API端点：清除所有对话
@app.route('/api/clear_all_conversations', methods=['POST'])
@login_required
def clear_all_conversations():
    try:
        # 获取用户的所有对话
        user_conversations = Conversation.query.filter_by(user_id=current_user.id).all()
        
        # 删除关联的所有消息和markdown文件
        for conv in user_conversations:
            # 获取对话关联的所有消息
            messages = Message.query.filter_by(conversation_id=conv.id).all()
            
            # 删除消息
            for msg in messages:
                db.session.delete(msg)
            
            # 查找并删除可能的Markdown文件
            for filename in os.listdir(MARKDOWN_DIR):
                if filename.startswith(f"{conv.id}_"):
                    try:
                        os.remove(os.path.join(MARKDOWN_DIR, filename))
                    except:
                        pass  # 忽略文件删除错误
            
            # 删除对话
            db.session.delete(conv)
        
        # 提交数据库更改
        db.session.commit()
        
        return jsonify({'success': True, 'message': '所有对话已清除'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        
        # 检查并添加新字段到数据库
        inspector = inspect(db.engine)
        columns = [column['name'] for column in inspector.get_columns('user')]
        
        # 如果缺少智谱清言API相关的列，添加它们
        if 'zhipuai_api_key' not in columns:
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN zhipuai_api_key VARCHAR(200)"))
                conn.commit()
            print("已添加字段: zhipuai_api_key")
        
        if 'zhipuai_api_base_url' not in columns:
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN zhipuai_api_base_url VARCHAR(200) DEFAULT 'https://open.bigmodel.cn/api/paas/v4'"))
                conn.commit()
            print("已添加字段: zhipuai_api_base_url")
        
        # 检查并添加主题字段
        if 'theme' not in columns:
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN theme VARCHAR(20) DEFAULT 'colorful'"))
                conn.commit()
            print("已添加字段: theme")
            
    import webbrowser
    webbrowser.open('http://127.0.0.1:8080')
    app.run(debug=True, port=8080) 