from flask import Flask, render_template, request, jsonify
from chromadb import HttpClient
from chromadb.errors import ChromaError

app = Flask(__name__)

# 全局变量用于存储当前客户端连接
current_client = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/heartbeat')
def heartbeat():
    """检查ChromaDB连接状态"""
    global current_client
    if current_client is None:
        return jsonify({'status': 'disconnected'}), 400
    
    try:
        result = current_client.heartbeat()
        return jsonify({'status': 'connected', 'heartbeat': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/connect', methods=['POST'])
def connect():
    """连接到ChromaDB服务器"""
    global current_client
    
    try:
        data = request.get_json()
        ip = data.get('ip')
        port = int(data.get('port'))
        
        # 连接到ChromaDB
        client = HttpClient(host=ip, port=port)
        
        # 测试连接
        client.heartbeat()
        
        # 保存当前客户端
        current_client = client
        
        # 获取所有collections
        collections = client.list_collections()
        collection_names = [col.name for col in collections]
        
        return jsonify({
            'status': 'success',
            'message': 'Connected successfully',
            'collections': collection_names
        })
    except ValueError as e:
        return jsonify({'status': 'error', 'message': f'Invalid port: {str(e)}'}), 400
    except ChromaError as e:
        return jsonify({'status': 'error', 'message': f'ChromaDB error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Connection failed: {str(e)}'}), 500

@app.route('/api/collection/<name>')
def get_collection(name):
    """获取指定collection的数据，支持分页"""
    global current_client
    
    if current_client is None:
        return jsonify({'status': 'error', 'message': 'Not connected to ChromaDB'}), 400
    
    try:
        print(f"\n=== Processing request for collection: {name} ===")
        
        # 获取分页参数
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        print(f"Pagination: page={page}, limit={limit}")
        
        # 获取collection
        collection = current_client.get_collection(name=name)
        print(f"Got collection: {collection.name}")
        
        # 获取所有数据 - 使用get()方法的默认参数确保返回一致格式
        data = collection.get()
        print(f"Raw data type: {type(data)}")
        print(f"Raw data keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
        
        # 确保数据是字典类型
        if not isinstance(data, dict):
            print(f"ERROR: Data is not a dict, got: {type(data)}")
            return jsonify({'status': 'error', 'message': 'Invalid data format from ChromaDB'}), 500
        
        # 确保所有字段都是列表类型
        ids = data.get('ids', []) if isinstance(data.get('ids'), list) else []
        documents = data.get('documents', []) if isinstance(data.get('documents'), list) else []
        metadatas = data.get('metadatas', []) if isinstance(data.get('metadatas'), list) else []
        embeddings = data.get('embeddings', []) if isinstance(data.get('embeddings'), list) else []
        
        print(f"Data lengths: ids={len(ids)}, documents={len(documents)}, metadatas={len(metadatas)}, embeddings={len(embeddings)}")
        
        # 验证数据完整性 - 只考虑ids, documents, metadatas，忽略embeddings（可能为空）
        # 先计算核心数据的最小长度
        core_min_len = min(len(ids), len(documents), len(metadatas))
        
        # 如果核心数据长度不一致，只使用最短的长度
        if core_min_len != max(len(ids), len(documents), len(metadatas)):
            print(f"WARNING: Core data lengths inconsistent, using core_min_len={core_min_len}")
            ids = ids[:core_min_len]
            documents = documents[:core_min_len]
            metadatas = metadatas[:core_min_len]
        
        # 处理embeddings - 确保长度不超过核心数据
        if len(embeddings) > core_min_len:
            embeddings = embeddings[:core_min_len]
        # 如果embeddings长度不足，用空列表填充
        elif len(embeddings) < core_min_len:
            # 不需要填充，直接使用现有长度
            print(f"INFO: embeddings length ({len(embeddings)}) less than core data length ({core_min_len})")
        
        # 更新实际数据长度
        min_len = core_min_len
        
        total = len(ids)
        offset = (page - 1) * limit
        print(f"Total documents: {total}, offset: {offset}")
        
        # 确保offset不超过数据长度
        offset = min(offset, max(0, total - 1))
        print(f"Adjusted offset: {offset}")
        
        # 分页数据
        paginated_ids = ids[offset:offset + limit]
        paginated_documents = documents[offset:offset + limit]
        paginated_metadatas = metadatas[offset:offset + limit]
        paginated_embeddings = embeddings[offset:offset + limit]
        
        print(f"Paginated data lengths: ids={len(paginated_ids)}, documents={len(paginated_documents)}")
        
        # 转换为可JSON序列化的格式
        result = {
            'status': 'success',
            'data': {
                'ids': paginated_ids,
                'documents': paginated_documents,
                'metadatas': paginated_metadatas,
                'embeddings': paginated_embeddings,
                'count': total,
                'page': page,
                'limit': limit,
                'total_pages': (total + limit - 1) // limit
            }
        }
        
        print(f"Response: status=success, total_pages={result['data']['total_pages']}")
        print("=== Request processed successfully ===")
        
        return jsonify(result)
    except ChromaError as e:
        print(f"ChromaError: {str(e)}")
        return jsonify({'status': 'error', 'message': f'ChromaDB error: {str(e)}'}), 500
    except ValueError as e:
        print(f"ValueError: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Value error: {str(e)}'}), 400
    except TypeError as e:
        print(f"TypeError: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'Type error: {str(e)}'}), 500
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        import traceback
        # 打印详细错误信息到控制台
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'Error getting collection data: {str(e)}', 'type': type(e).__name__}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
